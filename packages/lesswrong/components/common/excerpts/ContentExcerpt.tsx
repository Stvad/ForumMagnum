import React, { useCallback, useState } from "react";
import { Components, registerComponent } from "../../../lib/vulcan-lib";
import { Link } from "../../../lib/reactRouterWrapper";
import type { ContentStyleType } from "../ContentStyles";
import classNames from "classnames";

const HTML_CHARS_PER_LINE_HEURISTIC = 120;
const EXPAND_IN_PLACE_LINES = 10;

const contentTypeMap: Record<ContentStyleType, string> = {
  post: "post",
  postHighlight: "post",
  comment: "comment",
  commentExceptPointerEvents: "comment",
  answer: "answer",
  tag: "tag",
  debateResponse: "debate response",
};

const normalHeading = {
  fontSize: "16px !important",
};

const smallHeading = {
  fontSize: "14px !important",
  fontWeight: 700,
};

const styles = (theme: ThemeType) => ({
  root: {
  },
  excerpt: {
    position: "relative",
    fontSize: "1.1rem",
    lineHeight: "1.5em",
    overflow: "hidden",
    textOverflow: "ellipsis",
    display: "-webkit-box",
    "-webkit-box-orient": "vertical",
  },
  contentNormalText: {
    "& h1": normalHeading,
    "& h2": normalHeading,
    "& h3": normalHeading,
    "& h4": normalHeading,
    "& h5": normalHeading,
    "& h6": normalHeading,
  },
  contentSmallText: {
    "& h1": smallHeading,
    "& h2": smallHeading,
    "& h3": smallHeading,
    "& h4": smallHeading,
    "& h5": smallHeading,
    "& h6": smallHeading,
    "& p": {fontSize: "13px !important"},
  },
  continueReading: {
    cursor: "pointer",
    display: "block",
    marginTop: 12,
    color: theme.palette.primary.main,
    fontFamily: theme.palette.fonts.sansSerifStack,
    fontSize: 14,
    fontWeight: 500,
    "&:hover": {
      opacity: 1,
      color: `${theme.palette.primary.light} !important`,
    },
  },
});

const ContentExcerpt = ({
  contentHtml,
  moreLink,
  hideMoreLink,
  smallText,
  lines = 3,
  alwaysExpandInPlace,
  contentType,
  className,
  classes,
}: {
  contentHtml: string,
  moreLink: string,
  hideMoreLink?: boolean,
  smallText?: boolean,
  contentType: ContentStyleType,
  lines?: number,
  alwaysExpandInPlace?: boolean,
  className?: string,
  classes: ClassesType,
}) => {
  const [expanded, setExpanded] = useState(false);

  const onExpand = useCallback(() => setExpanded(true), []);

  const isTruncated = contentHtml.length > HTML_CHARS_PER_LINE_HEURISTIC * lines;
  const expandInPlace = alwaysExpandInPlace ||
    contentHtml.length < HTML_CHARS_PER_LINE_HEURISTIC * EXPAND_IN_PLACE_LINES;

  const {ContentStyles, ContentItemBody} = Components;
  return (
    <div className={classNames(classes.root, className)}>
      <ContentStyles
        contentType={contentType}
        className={classes.excerpt}
        style={expanded ? undefined : {WebkitLineClamp: lines}}
      >
        <ContentItemBody
          dangerouslySetInnerHTML={{__html: contentHtml}}
          className={classNames({
            [classes.contentNormalText]: !smallText,
            [classes.contentSmallText]: smallText,
          })}
        />
      </ContentStyles>
      {!hideMoreLink && (expandInPlace
        ? (
          expanded
            ? null
            : (
              <div onClick={onExpand} className={classes.continueReading}>
                Continue reading
              </div>
            )
        )
        : (
          <Link to={moreLink} className={classes.continueReading}>
            {isTruncated
              ? "Continue reading"
              : `View ${contentTypeMap[contentType]}`
            }
          </Link>
        )
      )}
    </div>
  );
}

const ContentExcerptComponent = registerComponent(
  "ContentExcerpt",
  ContentExcerpt,
  {styles, stylePriority: -1},
);

declare global {
  interface ComponentTypes {
    ContentExcerpt: typeof ContentExcerptComponent,
  }
}
