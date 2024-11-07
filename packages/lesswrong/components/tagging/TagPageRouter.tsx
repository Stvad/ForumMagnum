import React from "react";
import { useLocation } from "../../lib/routeUtil";
import { Components, registerComponent } from "../../lib/vulcan-lib";
import { useOverrideLayoutOptions } from "../hooks/useLayoutOptions";
import { useTagBySlug } from "./useTag";

/**
 * Build structured data for a tag to help with SEO.
 */
export const getTagStructuredData = (tag: TagPageFragment | TagPageWithRevisionFragment) => {
  const hasSubTags = !!tag.subTags && tag.subTags.length > 0;

  return {
    "@context": "http://schema.org",
    "@type": "WebPage",
    "name": tag.name,
    ...(hasSubTags && { "mentions": tag.subTags.map((subtag) => ({
        "@type": "Thing",
        "name": subtag.name,
      }))
    }),
    "interactionStatistic": {
      "@type": "InteractionCounter",
      "interactionType": "http://schema.org/WriteAction",
      "userInteractionCount": tag.postCount,
    },
  };
};


/**
 * Wrapper component for routing to either the subforum page or the ordinary tag page.
 */
const TagPageRouter = () => {
  const { query, params: { slug } } = useLocation();
  const [overridenLayoutOptions, setOverridenLayoutOptions] = useOverrideLayoutOptions();

  const { version: queryVersion, revision: queryRevision } = query;
  const revision = queryVersion ?? queryRevision ?? undefined;
  const contributorsLimit = 7;

  // NOTE: In order to keep things decoupled I don't pass this down to either of the child pages (I think SomethingPage components
  // should be able to be rendered without having data passed into them), but this shouldn't result in any extra queries as the queries in the
  // child pages should hit the cache. Also ~all other queries in the child pages require the tag to be loaded first, so this shouldn't have
  // any performance cost.
  const { tag, loading: loadingTag } = useTagBySlug(slug, revision ? "TagPageWithRevisionFragment" : "TagPageFragment", {
    extraVariables: revision ? {
      version: 'String',
      contributorsLimit: 'Int',
    } : {
      contributorsLimit: 'Int',
    },
    extraVariablesValues: revision ? {
      version: revision,
      contributorsLimit,
    } : {
      contributorsLimit,
    },
  });

  if (loadingTag) return null
  if (!tag) return <Components.Error404/>
  
  if (
    !!tag.isSubforum !== !!overridenLayoutOptions.unspacedGridLayout ||
    !!tag.isSubforum !== !!overridenLayoutOptions.standaloneNavigation ||
    !!tag.isSubforum !== !!overridenLayoutOptions.shouldUseGridLayout
  ) {
    // NOTE: There is an edge case here where if you navigate from one tag page to another, this component isn't
    // unmounted, so the overriden layout options aren't automatically cleared by the callback in useLayoutOptions.tsx.
    // So we have to explicitly clear them here.
    setOverridenLayoutOptions(tag.isSubforum ? {
      unspacedGridLayout: true,
      standaloneNavigation: true,
      shouldUseGridLayout: true,
    } : {});
  }

  const {TagPage, TagSubforumPage2} = Components
  return tag.isSubforum ? <TagSubforumPage2/> : <TagPage/>
}

const TagPageRouterComponent = registerComponent("TagPageRouter", TagPageRouter);

declare global {
  interface ComponentTypes {
    TagPageRouter: typeof TagPageRouterComponent
  }
}
