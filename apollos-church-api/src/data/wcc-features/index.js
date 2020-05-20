/* eslint-disable camelcase */
import { Feature as baseFeatures } from '@apollosproject/data-connector-rock';
import { createGlobalId, parseGlobalId } from '@apollosproject/server-core';
import { startCase, get } from 'lodash';
import gql from 'graphql-tag';
import moment from 'moment-timezone';

const getSpotifyEmbed = (url) => {
  const playlistParts = url.split('playlist/');
  if (!playlistParts.length || !playlistParts[1]) return null;
  const playlistId = playlistParts[1].split('?')[0];

  return `https://open.spotify.com/embed/playlist/${playlistId}`;
};

class WCCFeatures extends baseFeatures.dataSource {
  ACTION_ALGORITHIMS = {
    // We need to make sure `this` refers to the class, not the `ACTION_ALGORITHIMS` object.
    ...this.ACTION_ALGORITHIMS,
    CONNECT_SCREEN: this.connectScreenAlgorithm.bind(this),
    WCC_MESSAGES: this.mediaMessages.bind(this),
    CAMPUS_ITEMS: this.campusItemsAlgorithm.bind(this),
    WCC_SERIES: this.mediaSeries.bind(this),
  };

  getFromId(args, id) {
    const type = id.split(':')[0];
    const funcArgs = JSON.parse(args);
    const method = this[`create${type}`].bind(this);
    if (funcArgs.campusId) {
      this.context.campusId = funcArgs.campusId;
    }
    return method(funcArgs);
  }

  createFeatureId({ args, type }) {
    return createGlobalId(
      JSON.stringify({ campusId: this.context.campusId, ...args }),
      type
    );
  }

  createSpeakerFeature = ({ name, id }) => ({
    name,
    id: createGlobalId(id, 'SpeakerFeature'),
    __typename: 'SpeakerFeature',
  });

  createWebviewFeature = ({ id, external_playlist }) => ({
    title: 'Setlist',
    // linkText: 'Open in Spotify',
    url: getSpotifyEmbed(external_playlist),
    id: createGlobalId(id, 'WebviewFeature'),
    __typename: 'WebviewFeature',
  });

  createSocialIconsFeature = ({ title }) => ({
    id: createGlobalId('SocialIconsFeature', 'SocialIconsFeature'),
    socialIcons: [
      { icon: 'instagram', url: 'https://www.instagram.com/theporch/' },
      { icon: 'facebook', url: 'https://www.facebook.com/theporchdallas/' },
      { icon: 'youtube', url: 'https://www.youtube.com/user/porchdallas' },
      { icon: 'twitter', url: 'https://twitter.com/theporch' },
    ],
    title,
    __typename: 'SocialIconsFeature',
  });

  async mediaSeries({ seriesId } = {}) {
    const { WCCSeries } = this.context.dataSources;
    const item = await WCCSeries.getFromId(seriesId.toString());

    if (!item) return [];

    return [
      {
        id: createGlobalId(`${item.id}`, 'ActionListAction'),
        labelText: 'Series',
        title: item.title,
        relatedNode: { ...item, __type: 'WCCSeries' },
        image: WCCSeries.getCoverImage(item),
        action: 'READ_CONTENT',
        summary: item.subtitle,
      },
    ];
  }

  async mediaMessages({ filters = {}, limit = 3 } = {}) {
    const { WCCMessage } = this.context.dataSources;
    const { edges: messages } = await WCCMessage.paginate({
      pagination: { first: limit },
      filters: {
        target: 'the_porch',
        ...filters,
      },
    });

    return messages.map(({ node: item }, i) => ({
      id: createGlobalId(`${item.id}${i}`, 'ActionListAction'),
      // labelText: 'Latest Message',
      title: item.title,
      relatedNode: { ...item, __type: 'WCCMessage' },
      image: WCCMessage.getCoverImage(item),
      action: 'READ_CONTENT',
      summary: WCCMessage.createSummary(item),
    }));
  }

  async campaignItemsAlgorithm({ limit = 1, skip = 0 } = {}) {
    const { WCCMessage, LiveStream } = this.context.dataSources;

    let campaignItems = [];

    // **********
    // Case 1: Handle Live Stream with a Message Object
    // **********
    let liveStreamIsInCampaign = false; // used to prevent live stream from showing twice
    const streams = await LiveStream.getLiveStreams();

    // look for a content item
    const liveStream = await streams.find(
      async ({ contentItem }) => contentItem
    );

    const tzDate = moment(liveStream?.eventStartTime).tz('America/Chicago');

    if (liveStream) {
      const contentItem = await liveStream.contentItem;
      const contentDate = moment(contentItem.date).startOf('day'); // content dates don't have timestamps on them anyways
      const messageIsTodayOrLater = contentDate >= moment().startOf('day');
      const streamIsToday = moment().isSame(liveStream.eventStartTime, 'day');
      if (messageIsTodayOrLater || streamIsToday) {
        // then show the upcoming live event on the home feed.
        // Otherwise, we won't show the upcoming message (as it may be an old message still)
        liveStreamIsInCampaign = true; // used to prevent live stream for showing twice

        const dayOfStream = tzDate.format('ddd');
        const timeOfStream = `${tzDate.format('ha')} CT`;

        let dayLabel = `Next ${dayOfStream} at ${timeOfStream}`;
        if (tzDate < new Date()) dayLabel = `Last ${dayOfStream}`;
        if (streamIsToday) dayLabel = `Today at ${timeOfStream}`;

        campaignItems.push({
          id: createGlobalId(`${contentItem.id}${0}`, 'ActionListAction'),
          labelText: dayLabel,
          title: contentItem.title,
          relatedNode: { ...contentItem, __type: 'WCCMessage' },
          image: WCCMessage.getCoverImage(contentItem),
          action: 'READ_CONTENT',
          summary: WCCMessage.createSummary(contentItem),
        });
      }
    }

    // early exit for optimization
    if (limit + skip <= campaignItems.length) {
      return campaignItems.slice(skip, skip + limit);
    }

    // **********
    // Case 2: Handle the Latest Message
    // **********

    let { edges: currentMessages = [] } = await WCCMessage.paginate({
      pagination: { first: 2 },
      filters: { target: 'the_porch', 'filter[tag_id][]': 40 },
    });

    currentMessages = currentMessages.filter(
      ({ node: item }) => moment(item.date) < moment().startOf('day')
    );

    campaignItems = [
      ...campaignItems,
      ...currentMessages.map(({ node: item }, i) => ({
        id: createGlobalId(
          `${item.id}${i + campaignItems.length}`,
          'ActionListAction'
        ),
        labelText: 'Latest Message',
        title: item.title,
        relatedNode: { ...item, __type: 'WCCMessage' },
        image: WCCMessage.getCoverImage(item),
        action: 'READ_CONTENT',
        summary: WCCMessage.createSummary(item),
      })),
    ];

    // early exit for optimization
    if (limit + skip <= campaignItems.length) {
      return campaignItems.slice(skip, skip + limit);
    }

    // **********
    // Case 3: Handle the Upcoming Live Stream
    // **********

    if (liveStream && !liveStreamIsInCampaign) {
      campaignItems.push({
        id: createGlobalId(
          `${liveStream.id}${campaignItems.length}`,
          'ActionListAction'
        ),
        labelText: `${tzDate < new Date() ? 'Last' : 'Next'} ${tzDate.format(
          'ddd'
        )} at ${tzDate.format('ha')} CT`,
        title: liveStream.title,
        relatedNode: { __typename: 'WCCLiveStream', ...liveStream },
        image: LiveStream.getCoverImage(liveStream),
        action: 'READ_CONTENT',
        hasAction: false,
        summary: liveStream.description,
      });
    }

    // **********
    // Case 4: Handle Contentful Featured Content (TODO)
    // **********

    return campaignItems.slice(skip, skip + limit);
  }

  async userFeedAlgorithm({ limit = 20 } = {}) {
    const { WCCBlog, WCCMessage } = this.context.dataSources;

    const { edges: blogEdges } = await WCCBlog.paginate({
      pagination: { limit },
    });

    const { edges: messageEdges } = await WCCMessage.paginate({
      pagination: { limit },
      filters: { target: 'the_porch' },
    });

    const blogs = blogEdges.map(({ node: item }, i) => ({
      id: createGlobalId(`${item.id}${i}`, 'ActionListAction'),
      title: item.title,
      relatedNode: { ...item, __type: 'WCCBlog' },
      image: WCCBlog.getCoverImage(item),
      action: 'READ_CONTENT',
      summary: item.subtitle,
      labelText: 'From the Blog',
    }));

    const messages = messageEdges.map(({ node: item }, i) => ({
      id: createGlobalId(`${item.id}${i}`, 'ActionListAction'),
      title: item.title,
      relatedNode: { ...item, __type: 'WCCMessage' },
      image: WCCMessage.getCoverImage(item),
      action: 'READ_CONTENT',
      summary: WCCMessage.createSummary(item),
      labelText: item.series.title,
    }));

    const items = [...blogs, ...messages];

    // return items.sort(
    //   (nodeA, nodeB) =>
    //     new Date(nodeA.relatedNode.date) - new Date(nodeB.relatedNode.date)
    // );
    return items;
  }

  async campusItemsAlgorithm() {
    const {
      campusId,
      dataSources: { ContentItem },
    } = this.context;
    if (!campusId) {
      return [];
    }

    const rockCampusId = parseGlobalId(campusId).id;

    const itemsCursor = await ContentItem.byRockCampus({
      campusId: rockCampusId,
    });
    const items = await itemsCursor.get();

    return items.map((item, i) => ({
      id: createGlobalId(`${item.id}${i}`, 'ActionListAction'),
      title: item.title,
      subtitle: get(item, 'contentChannel.name'),
      relatedNode: {
        ...item,
        __typename: 'UniversalContentItem',
        __type: 'UniversalContentItem',
      },
      image: ContentItem.getCoverImage(item),
      action: 'READ_CONTENT',
      summary: ContentItem.createSummary(item),
    }));
  }

  async connectScreenAlgorithm() {
    const { ConnectScreen } = this.context.dataSources;
    const screen = await ConnectScreen.getDefaultPage();

    return screen.fields.listItems.map((item, i) => {
      const type = startCase(item.sys.contentType.sys.id);
      return {
        id: createGlobalId(`${item.id}${i}`, 'ActionListAction'),
        title: item.fields.title,
        subtitle: item.fields.summary,
        relatedNode: {
          ...item,
          id: item.sys.id,
          __type: type,
        },
        image: item.fields.mediaUrl
          ? { sources: [{ uri: item.fields.mediaUrl }] }
          : null,
        action: type === 'Link' ? 'OPEN_URL' : 'READ_CONTENT',
      };
    });
  }
}

const resolver = {
  ...baseFeatures.resolver,
  Query: {
    ...baseFeatures.resolver.Query,
    userFeedFeaturesWithCampus: (root, { campusId }, context, ...args) => {
      context.campusId = campusId;
      return baseFeatures.resolver.Query.userFeedFeatures(
        root,
        null,
        context,
        ...args
      );
    },
  },
  SpeakerFeature: {
    profileImage: async ({ name }, args, { dataSources }) => {
      const speaker = await dataSources.WCCMessage.getSpeakerByName({ name });
      if (speaker?.image) {
        return { sources: [{ uri: speaker.image }] };
      }
      return null;
    },
  },
  CardListItem: {
    coverImage: ({ image }) => image,
    hasAction: (root, args, { dataSources: { ContentItem } }) => {
      if (root.hasAction !== undefined) return root.hasAction;
      try {
        const type = ContentItem.resolveType(root.relatedNode);
        if (type === 'WCCMessage') return true;
      } catch {
        return false;
      }
    },
  },
};

const schema = gql`
  ${baseFeatures.schema}
  type SpeakerFeature implements Feature & Node {
    id: ID!
    order: Int

    name: String
    profileImage: ImageMedia
  }

  type SocialIconsItem {
    icon: String
    url: String
  }

  extend enum ACTION_FEATURE_ACTION {
    OPEN_URL
  }

  type SocialIconsFeature implements Feature & Node {
    id: ID!
    order: Int

    title: String
    socialIcons: [SocialIconsItem]
  }

  extend type Query {
    userFeedFeaturesWithCampus(campusId: ID): [Feature]
  }
`;

export { WCCFeatures as dataSource, schema, resolver };
