import { ApiClient, RecommendationResponse, requests } from 'recombee-api-client';
import { HybridRecombeeConfiguration, RecombeeRecommendationArgs } from '../../lib/collections/users/recommendationSettings';
import { loadByIds } from '../../lib/loaders';
import { filterNonnull } from '../../lib/utils/typeGuardUtils';
import { htmlToTextDefault } from '../../lib/htmlToText';
import { truncate } from '../../lib/editor/ellipsize';
import findByIds from '../vulcan-lib/findbyids';
import ReadStatuses from '../../lib/collections/readStatus/collection';
import moment from 'moment';
import { accessFilterMultiple } from '../../lib/utils/schemaUtils';
import { recombeeDatabaseIdSetting, recombeePrivateApiTokenSetting } from '../../lib/instanceSettings';
import { viewTermsToQuery } from '../../lib/utils/viewUtils';
import { stickiedPostTerms } from '../../components/posts/RecombeePostsList';

export const getRecombeeClientOrThrow = (() => {
  let client: ApiClient;

  return () => {
    if (!client) {
      const databaseId = recombeeDatabaseIdSetting.get();
      const apiToken = recombeePrivateApiTokenSetting.get();

      if (!databaseId || !apiToken) {
        throw new Error('Missing either databaseId or api token when initializing Recombee client!');
      }
      
      // TODO - pull out client options like region to db settings?
      client = new ApiClient(databaseId, apiToken, { region: 'us-west' });
    }

    return client;
  };
})();

const voteTypeRatingsMap: Partial<Record<string, number>> = {
  bigDownvote: -1,
  smallDownvote: -0.5,
  smallUpvote: 0.5,
  bigUpvote: 1,
};

const HYBRID_SCENARIO_MAP = {
  configurable: 'recombee-hybrid-1-nearterm',
  fixed: 'recombee-hybrid-2-global'
};

interface OnsitePostRecommendationsInfo {
  curatedPostIds: string[],
  stickiedPostIds: string[],
  excludedPostFilter?: string,
}

const recombeeRequestHelpers = {
  createRecommendationsForUserRequest(userId: string, count: number, lwAlgoSettings: RecombeeRecommendationArgs) {
    const { userId: overrideUserId, rotationTime, lwRationalityOnly, onlyUnread, loadMore, ...settings } = lwAlgoSettings;

    if (loadMore) {
      return new requests.RecommendNextItems(loadMore.prevRecommId, count);
    }

    const servedUserId = overrideUserId ?? userId;
    const rotationTimeSeconds = typeof rotationTime === 'number' ? rotationTime * 3600 : undefined;

    // TODO: pass in scenario, exclude unread, etc, in options?
    const lwRationalityFilter = lwRationalityOnly ? ` and ("Rationality" in 'core_tags' or "World Modeling" in 'core_tags')` : '';

    return new requests.RecommendItemsToUser(servedUserId, count, {
      ...settings,
      // Explicitly coalesce empty strings to undefined, since empty strings aren't valid booster expressions
      booster: settings.booster || undefined,
      rotationTime: rotationTimeSeconds
    });
  },

  async createUpsertPostRequest(post: DbPost, context: ResolverContext, tags?: { name: string, core: boolean }[]) {
    const { Tags } = context;

    const tagIds = Object.entries(post.tagRelevance ?? {}).filter(([_, relevance]: [string, number]) => relevance > 0).map(([tagId]) => tagId)
    tags ??= filterNonnull(await findByIds(Tags, tagIds))
    const tagNames = tags.map(tag => tag.name)
    const coreTagNames = tags.filter(tag => tag.core).map(tag => tag.name)

    const postText = htmlToTextDefault(truncate(post.contents?.html, 2000, 'words'))

    return new requests.SetItemValues(post._id, {
      title: post.title,
      author: post.author,
      authorId: post.userId,
      karma: post.baseScore,
      body: postText,
      postedAt: post.postedAt,
      tags: tagNames,
      coreTags: coreTagNames,
      curated: !!post.curatedDate,
      frontpage: !!post.frontpageDate,
      draft: !!post.draft,
      lastCommentedAt: post.lastCommentedAt,
    }, { cascadeCreate: true });
  },

  createReadStatusRequest(readStatus: DbReadStatus) {
    if (!readStatus.postId) {
      // eslint-disable-next-line no-console
      console.error(`Missing postId for read status ${readStatus._id} when trying to add detail view to recombee`);
      return;
    }

    return new requests.AddDetailView(readStatus.userId, readStatus.postId, {
      timestamp: readStatus.lastUpdated.toISOString(),
      cascadeCreate: false
    });
  },

  createVoteRequest(vote: DbVote) {
    const rating = voteTypeRatingsMap[vote.voteType];
    if (typeof rating !== 'number') {
      // eslint-disable-next-line no-console
      console.log(`Attempted to create a recombee rating request for a non-karma vote with id ${vote._id}`);
      return;
    }

    return new requests.AddRating(vote.userId, vote.documentId, rating, {
      timestamp: vote.votedAt.toISOString(),
      cascadeCreate: false
    });
  },

  createUpsertUserDetailsRequest(user: DbUser) {
    const { displayName, karma, createdAt } = user;
    return new requests.SetUserValues(user._id, { displayName, karma, createdAt }, { cascadeCreate: true });
  },

  getBatchRequest(requestBatch: requests.Request[]) {
    return new requests.Batch(requestBatch);
  },

  async getOnsitePostInfo(lwAlgoSettings: HybridRecombeeConfiguration, context: ResolverContext): Promise<OnsitePostRecommendationsInfo> {
    if (lwAlgoSettings.loadMore) {
      return {
        curatedPostIds: [],
        stickiedPostIds: [],
        excludedPostFilter: undefined,
      };
    }

    const postPromises =  [curatedPostTerms, stickiedPostTerms]
      .map(terms => viewTermsToQuery("Posts", terms, undefined, context))
      .map(postsQuery => context.Posts.find(postsQuery.selector, postsQuery.options, { _id: 1 }).fetch());

    const [curatedPosts, stickiedPosts] = await Promise.all(postPromises);

    const curatedPostIds = curatedPosts.map(post => post._id);
    const stickiedPostIds = stickiedPosts.map(post => post._id);
    const excludedPostIds = [...curatedPostIds, ...stickiedPostIds];
    const excludedPostFilter = `'itemId' not in {${excludedPostIds.map(id => `"${id}"`).join(', ')}}`;

    return {
      curatedPostIds,
      stickiedPostIds,
      excludedPostFilter,
    };
  },

  convertHybridToRecombeeArgs(hybridArgs: HybridRecombeeConfiguration, hybridArm: keyof typeof HYBRID_SCENARIO_MAP, filter?: string) {
    const { loadMore, userId, ...rest } = hybridArgs;

    const scenario = HYBRID_SCENARIO_MAP[hybridArm];
    const isConfigurable = hybridArm === 'configurable';
    const clientConfig: Partial<Omit<HybridRecombeeConfiguration,"loadMore"|"userId">> = isConfigurable ? rest : {rotationRate: 0.1, rotationTime: 144};
    const prevRecommIdIndex = isConfigurable ? 0 : 1;
    const loadMoreConfig = loadMore
      ? { loadMore: { prevRecommId: loadMore.prevRecommIds[prevRecommIdIndex] } }
      : {};

    return {
      userId,
      ...clientConfig,
      filter,
      scenario,
      ...loadMoreConfig
    };
  }
};

const curatedPostTerms: PostsViewTerms = {
  view: 'curated',
  limit: 3,
};

const recombeeApi = {
  async getRecommendationsForUser(userId: string, count: number, lwAlgoSettings: RecombeeRecommendationArgs, context: ResolverContext) {
    const client = getRecombeeClientOrThrow();

    // TODO: Now having Recombee filter out read posts, maybe clean up?
    const modifiedCount = count * 1;
    const request = recombeeRequestHelpers.createRecommendationsForUserRequest(userId, modifiedCount, lwAlgoSettings);

    // We need the type cast here because recombee's type definitions can't handle inferring response types for union request types, even if they have the same response type
    const recombeeResponse = await client.send(request) as RecommendationResponse;

    // remove posts read more than a week ago
    const twoWeeksAgo = moment(new Date()).subtract(2, 'week').toDate();
    const postIds = recombeeResponse.recomms.map(rec => rec.id);
    const [
      posts,
      readStatuses
    ] = await Promise.all([ 
      filterNonnull(await loadByIds(context, 'Posts', postIds)),
      ReadStatuses.find({ 
        postId: { $in: postIds }, 
        userId, 
        isRead: true, 
        lastUpdated: { $lt: twoWeeksAgo } 
      }).fetch()
    ])

    //should basically never take any out
    const filteredPosts = await accessFilterMultiple(context.currentUser, context.Posts, posts, context)

    // TO-DO: clean up. Recombee should now be handling this for us but maybe we'll need it again for some reason

    // //sort the posts by read/unread but ensure otherwise preserving Recombee's returned order
    // const unreadOrRecentlyReadPosts = filteredPosts.filter(post => !readStatuses.find(readStatus => (readStatus.postId === post._id)));
    // const remainingPosts = filteredPosts.filter(post => readStatuses.find(readStatus => (readStatus.postId === post._id)));

    // //concatenate unread and read posts and return requested number
    // return unreadOrRecentlyReadPosts.concat(remainingPosts).slice(0, count).map(post => ({post, recommId: recombeeResponse.recommId}));

    return filteredPosts.map(post => ({ post, recommId: recombeeResponse.recommId }));
  },


  async getHybridRecommendationsForUser(userId: string, count: number, lwAlgoSettings: HybridRecombeeConfiguration, context: ResolverContext) {
    const client = getRecombeeClientOrThrow();

    const {
      curatedPostIds,
      stickiedPostIds,
      excludedPostFilter
    } = await recombeeRequestHelpers.getOnsitePostInfo(lwAlgoSettings, context);

    const modifiedCount = count + 0; // might want later?
    const split = 0.5;
    const firstCount = Math.floor(modifiedCount * split);
    const secondCount = modifiedCount - firstCount;

    const firstRequestSettings = recombeeRequestHelpers.convertHybridToRecombeeArgs(lwAlgoSettings, 'configurable', excludedPostFilter);
    const secondRequestSettings = recombeeRequestHelpers.convertHybridToRecombeeArgs(lwAlgoSettings, 'fixed', excludedPostFilter);

    const firstRequest = recombeeRequestHelpers.createRecommendationsForUserRequest(userId, firstCount, firstRequestSettings);
    const secondRequest = recombeeRequestHelpers.createRecommendationsForUserRequest(userId, secondCount, secondRequestSettings);
    const batchRequest = recombeeRequestHelpers.getBatchRequest([firstRequest, secondRequest]);

    const curatedPostReadStatusesPromise = lwAlgoSettings.loadMore
      ? Promise.resolve([])
      : context.ReadStatuses.find({ postId: { $in: curatedPostIds.slice(1) }, userId, isRead: true }).fetch();

    const [batchResponse, curatedPostReadStatuses] = await Promise.all([
      client.send(batchRequest),
      curatedPostReadStatusesPromise
    ]);
    // We need the type cast here because recombee's type definitions don't provide response types for batch requests
    const recombeeResponses = batchResponse.map(({json}) => json as RecommendationResponse);

    // We explicitly avoid deduplicating postIds because we want to see how often the same post is recommended by both arms of the hybrid recommender
    const recommendationIdPairs = recombeeResponses.flatMap(response => response.recomms.map(rec => [rec.id, response.recommId]))
    const recommendedPostIds = recommendationIdPairs.map(([id]) => id);
    const includedCuratedPostIds = curatedPostIds.filter(id => !curatedPostReadStatuses.find(readStatus => readStatus.postId === id));
    const postIds = [...includedCuratedPostIds, ...stickiedPostIds, ...recommendedPostIds];
    
    const posts = filterNonnull(await loadByIds(context, 'Posts', postIds));
    const orderedPosts = filterNonnull(postIds.map(id => posts.find(post => post._id === id)));
    const filteredPosts = await accessFilterMultiple(context.currentUser, context.Posts, orderedPosts, context);

    const mappedPosts = filteredPosts.map(post => {
      // _id isn't going to be filtered out by `accessFilterMultiple`
      const postId = post._id!;
      const recommId = recommendationIdPairs.find(([id]) => id === postId)?.[1];
      if (recommId) {
        return { post, recommId };
      } else {
        return {
          post,
          curated: curatedPostIds.includes(postId),
          stickied: stickiedPostIds.includes(postId)  
        };
      }
    });

    return mappedPosts;
  },


  async upsertPost(post: DbPost, context: ResolverContext) {
    const client = getRecombeeClientOrThrow();
    const request = await recombeeRequestHelpers.createUpsertPostRequest(post, context);

    await client.send(request);
  },

  async createReadStatus(readStatus: DbReadStatus) {
    const client = getRecombeeClientOrThrow();
    const request = recombeeRequestHelpers.createReadStatusRequest(readStatus);
    if (!request) {
      return;
    }

    await client.send(request);
  },

  async createVote(vote: DbVote) {
    const client = getRecombeeClientOrThrow();
    const request = recombeeRequestHelpers.createVoteRequest(vote);
    if (!request) {
      return;
    }

    await client.send(request);
  },

  async createUser(user: DbUser) {
    const client = getRecombeeClientOrThrow();
    const request = recombeeRequestHelpers.createUpsertUserDetailsRequest(user);
    await client.send(request);
  }
};

export { recombeeRequestHelpers, recombeeApi };