import { isNotRandomId, randomId } from '../lib/random';
import { getCookieFromReq, setCookieOnResponse } from './utils/httpUtil';
import type { AddMiddlewareType } from './apolloServer';
import express from 'express';
import { responseIsCacheable } from './cacheControlMiddleware';
import { ClientIdsRepo } from './repos';

const isApplicableUrl = (url: string) =>
  url !== "/robots.txt" && url.indexOf("/api/") < 0;

// General contract:
// - Anything that is a securty risk, or causes inconsistencies in our *analytics* is the responsibilty of the server to handle
// - Other inconsistencies should be handled by the CDN (and e.g. we might decide it's worth having inconsistent dates to get a higher cache hit rate)

// TODO:
// - [X] Check if the cookies are forwarded when the refresh request is sent to CloudFront
// - [X] Make sure this doesn't add set-cookie to requests that might be cached
// - [X] [Pending checking for duplicates] Rewrite ensure section as an INSERT ... ON CONFLICT query (add unique index in separate PR)
// - [X] Deal with timezone
//    - [X] Convert all instances of dates to use a <time> tag, so that the info is at least there for machines if needed
//    - [X] Add the logic for timeOverride described in the PR (this will add a `maybeCached`)
// - [X] Deal with clientId
//    - [X] Don't set it for cacheable requests
//    - [X] Generate it on the client instead
//    - [X] Make sure this is reflected correctly in logs/analytics
//      - Old behaviour: clientId always defined for SSR analytics event (including never before seen users, due to picking up the setCookieOnResponse)
//      - New behaviour: clientId is `undefined` throughout SSR for new users, on page loads that are cacheable
// - [X] Deal with tabId
//    - [X] Don't set it for cacheable requests
//    - [X] Generate it on the client instead
//    - [X] Make sure this is reflected correctly in logs
//      - Old behaviour: tabId always defined during SSR
//      - New behaviour: tabId null during SSR for page loads that are cacheable
// - [X] Deal with A/B tests
//    - [X] Throw an error if on dev A/B tests are used in a cacheFriendly request
//    - [X] Understand how the clientId thing affects this, maybe default to an unseeded random pick to help with not messing up the analytics
// - [X] Deal with the theme
//    - [X] Disable caching for non-default theme (as logged out users can only practically use the default theme unless they set their own cookies)
// - [ ] Add a way of measuring hit rate
//   - [ ] Add a field to the pageLoadFinished event that checks the header sent from CloudFront
// - [ ] Add a way of measuring staleness?
// - [X] Deal with cookies controlling UI
//    - Could be OK to punt on this, seeing as these mismatches already happen
// - [ ] Resolve inconsistencies between our local caching and external caching
// - [ ] Add a setting to enable this, so other instances can still set cookies if they want
// - [ ] [Maybe after deploying to a subset of posts, to get a baseline on staleness] Handle invalidation on write
// - [ ] [After deploying on a subset of posts] Ensure this works with previous deploys (i.e. it can handle the hash of the bundle not being up to date)
// - [ ] [Probably don't do] Generate a clientId cookie in the CDN for users that don't have one (one will be created on the first analytics request, so not a huge deal if this is missed)


// timeOverride logic:
// - Keep the concept of it being an override at the level of <App/>
// - But remove the concept at the level of <AppGenerator />, pass it in as ssrMetadata there
// - Add a useEffect in <AppGenerator />
//   - setState(null) after the first render
//   - use memo() to make it only trigger a re-render if `cacheFriendly` or `timezone` changes, or the time changes significantly

/**
 * - Assign a client id if there isn't one currently assigned
 * - Ensure the client id is stored in our DB (it may have been generated by a CDN)
 */
export const addClientIdMiddleware = (addMiddleware: AddMiddlewareType) => {
  addMiddleware(function addClientId(req: express.Request, res: express.Response, next: express.NextFunction) {
    const existingClientId = getCookieFromReq(req, "clientId")
    const referrer = req.headers?.["referer"] ?? null;
    const url = req.url;

    const clientIdsRepo = new ClientIdsRepo()

    // 1. If there is no client id, and this page won't be cached, create a clientId and add it to the response
    let newClientId: string | null = null
    if (!existingClientId && !responseIsCacheable(res)) {
      newClientId = randomId();
      setCookieOnResponse({
        req, res,
        cookieName: "clientId",
        cookieValue: newClientId,
        maxAge: 315360000
      });
    }

    // 2. If there is a client id, ensure (asynchronously) that it is stored in the DB
    const clientId = existingClientId ?? newClientId;
    if (clientId && isApplicableUrl(req.url) && !isNotRandomId(clientId)) {
      try {
        void clientIdsRepo.ensureClientId({
          clientId,
          firstSeenReferrer: referrer,
          firstSeenLandingPage: url,
        });
      } catch(e) {
        //eslint-disable-next-line no-console
        console.error(e);
      }
    }

    next();
  });
}
