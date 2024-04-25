import React, { useState } from 'react';
import { Components, fragmentTextForQuery, registerComponent } from '../../lib/vulcan-lib';
import { NetworkStatus, gql, useQuery } from '@apollo/client';
import { HybridRecombeeConfiguration, RecombeeConfiguration, VertexConfiguration } from '../../lib/collections/users/recommendationSettings';
import { useOnMountTracking } from '../../lib/analyticsEvents';
import uniq from 'lodash/uniq';
import { filterNonnull } from '../../lib/utils/typeGuardUtils';
import { isServer } from '../../lib/executionEnvironment';

// Would be nice not to duplicate in postResolvers.ts but unfortunately the post types are different
interface VertexRecommendedPost {
  post: PostsListWithVotes,
  attributionId: string,
  curated?: never,
  stickied?: never,
}

const styles = (theme: ThemeType) => ({
  root: {

  }
});

const DEFAULT_RESOLVER_NAME = 'GoogleVertexPosts';

type VertexResolver = typeof DEFAULT_RESOLVER_NAME;

const getVertexPostsQuery = (resolverName: VertexResolver) => gql`
  query get${resolverName}($limit: Int) {
    ${resolverName}(limit: $limit) {
      results {
        post {
          ...PostsListWithVotes
        }
        attributionId
      }
    }
  }
  ${fragmentTextForQuery('PostsListWithVotes')}
`;

const getLoadMoreSettings = (resolverName: VertexResolver, results: VertexRecommendedPost[]): VertexConfiguration['loadMore'] => {
  switch (resolverName) {
    case DEFAULT_RESOLVER_NAME:
      const prevAttributionId = results.find(result => result.attributionId)?.attributionId;
      if (!prevAttributionId) {
        return undefined;
      }
      return { prevAttributionId };  
  }
}

export const stickiedPostTerms: PostsViewTerms = {
  view: 'stickied',
  limit: 4, // seriously, shouldn't have more than 4 stickied posts
  forum: true
};

export const VertexPostsList = ({ limit = 100, classes }: {
  limit?: number,
  classes: ClassesType<typeof styles>,
}) => {
  const { LoadMore, PostsItem, SectionFooter, PostsLoading } = Components;

  const [displayCount, setDisplayCount] = useState(15);

  const resolverName = DEFAULT_RESOLVER_NAME;

  const query = getVertexPostsQuery(resolverName);
  const { data, loading, fetchMore, networkStatus } = useQuery(query, {
    ssr: false || !isServer,
    notifyOnNetworkStatusChange: true,
    pollInterval: 0,
    variables: {
      limit,
    },
  });

  const results: VertexRecommendedPost[] | undefined = data?.[resolverName]?.results;
  const postIds = results?.map(({post}) => post._id) ?? [];

  useOnMountTracking({
    eventType: "postList",
    eventProps: { postIds },
    captureOnMount: (eventProps) => eventProps.postIds.length > 0,
    skip: !postIds.length || loading,
  });

  if (loading && !results) {
    return <PostsLoading placeholderCount={limit} />;
  }

  if (!results) {
    return null;
  }

  return <div>
    <div className={classes.root}>
      {results.slice(0, displayCount).map(({ post, attributionId: recommId, curated, stickied }) => <PostsItem 
        key={post._id} 
        post={post} 
        recombeeRecommId={recommId} 
        curatedIconLeft={curated} 
        terms={stickied ? stickiedPostTerms : undefined}
      />)}
    </div>
    <SectionFooter>
      <LoadMore
        loading={loading || networkStatus === NetworkStatus.fetchMore}
        loadMore={() => {
          // Purely for admin testing
          if (displayCount < 100) {
            setDisplayCount(Math.min(100, displayCount + 15));
          }
          // const loadMoreSettings = getLoadMoreSettings(resolverName, results);
          // void fetchMore({
          //   variables: {
          //     settings: { loadMore: loadMoreSettings },
          //   },
          //   // Update the apollo cache with the combined results of previous loads and the items returned by the current loadMore
          //   updateQuery: (prev: AnyBecauseHard, { fetchMoreResult }: AnyBecauseHard) => {
          //     if (!fetchMoreResult) return prev;

          //     return {
          //       [resolverName]: {
          //         __typename: fetchMoreResult[resolverName].__typename,
          //         results: [...prev[resolverName].results, ...fetchMoreResult[resolverName].results]
          //       }
          //     };
          //   }
          // });
        }}
        sectionFooterStyles
      />
    </SectionFooter>
  </div>;
}

const VertexPostsListComponent = registerComponent('VertexPostsList', VertexPostsList, {styles});

declare global {
  interface ComponentTypes {
    VertexPostsList: typeof VertexPostsListComponent
  }
}
