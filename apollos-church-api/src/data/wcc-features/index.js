import { Feature as baseFeatures } from '@apollosproject/data-connector-rock';
import { createGlobalId } from '@apollosproject/server-core';
import gql from 'graphql-tag';

class WCCFeatures extends baseFeatures.dataSource {
  // eslint-disable-next-line class-methods-use-this

  createSpeakerFeature = ({ name, id }) => ({
    name,
    id: createGlobalId(id, 'SpeakerFeature'),
    __typename: 'SpeakerFeature',
  });

  async userFeedAlgorithm({ limit = 20 } = {}) {
    const { WCCMessage } = this.context.dataSources;

    const { edges: items } = await WCCMessage.paginate({
      pagination: { limit },
      filters: { target: 'the_porch' },
    });

    return items.map(({ node: item }, i) => ({
      id: createGlobalId(`${item.id}${i}`, 'ActionListAction'),
      title: item.title,
      subtitle: item.subtitle,
      relatedNode: { ...item, __type: 'WCCMessage' },
      image: WCCMessage.getCoverImage(item),
      action: 'READ_CONTENT',
      summary: WCCMessage.subtitle,
    }));
  }
}

const resolver = {
  ...baseFeatures.resolver,
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
    coverImage: async (root, args, { dataSources: { WCCMessage } }) =>
      await root.image,
    hasAction: (root, args, { dataSources: { ContentItem } }) => {
      try {
        const type = ContentItem.resolveType(root.relatedNode);
        if (type === 'WCCMedia') return true;
      } finally {
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
`;

export { WCCFeatures as dataSource, schema, resolver };
