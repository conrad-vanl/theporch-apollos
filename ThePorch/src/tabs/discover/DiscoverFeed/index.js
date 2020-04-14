import React, { memo } from 'react';
import { Query } from 'react-apollo';
import { get } from 'lodash';
import PropTypes from 'prop-types';
import { Animated } from 'react-native';

import { FeedView } from '@apollosproject/ui-kit';
import { HorizontalLikedContentFeedConnected } from '@apollosproject/ui-connected';
import { SafeAreaView } from 'react-navigation';

import BackgroundView from '../../../ui/BackgroundTexture';
import TileContentFeed from './TileContentFeed';
import GET_CONTENT_CHANNELS from './getContentChannels';

const childContentItemLoadingState = {
  title: '',
  isLoading: true,
};

const feedItemLoadingState = {
  name: '',
  isLoading: true,
  id: 1,
};

const renderItem = (
  { item } // eslint-disable-line react/prop-types
) =>
  React.isValidElement(item) ? (
    item
  ) : (
    <TileContentFeed
      id={item?.id}
      name={item?.loading}
      content={get(item, 'childContentItemsConnection.edges', []).map(
        (edge) => edge.node
      )}
      isLoading={item?.isLoading}
      loadingStateObject={childContentItemLoadingState}
    />
  );

renderItem.propTypes = {
  item: PropTypes.shape({
    id: PropTypes.string,
    name: PropTypes.string,
    isLoading: PropTypes.bool,
  }),
};

const DiscoverFeed = memo(() => {
  const scrollY = new Animated.Value(0);

  return (
    <Query query={GET_CONTENT_CHANNELS} fetchPolicy="cache-and-network">
      {({ error, loading, data: { contentChannels = [] } = {}, refetch }) => {
        const [trending, ...otherChannels] = contentChannels;
        return (
          <BackgroundView animatedScrollPos={scrollY}>
            <FeedView
              onScroll={Animated.event([
                { nativeEvent: { contentOffset: { y: scrollY } } },
              ])}
              error={error}
              content={[
                trending,
                <HorizontalLikedContentFeedConnected key="liked" />,
                ...otherChannels,
              ]}
              ListHeaderComponent={
                <SafeAreaView forceInset={{ top: 'always' }} />
              }
              isLoading={loading && !contentChannels.length}
              refetch={refetch}
              renderItem={renderItem}
              loadingStateObject={feedItemLoadingState}
              numColumns={1}
            />
          </BackgroundView>
        );
      }}
    </Query>
  );
});

DiscoverFeed.displayName = 'DiscoverFeed';

export default DiscoverFeed;
