import React, { FC } from "react";
import Helmet from "react-helmet";

const TypeformScript: FC = () => (
  <Helmet>
    <script src="https://embed.typeform.com/next/embed.js" />
  </Helmet>
);

export const TypeformStandardEmbed: FC<{
  widgetId: string,
  title: string,
  parameters?: Record<string, boolean | string>,
  className?: string,
}> = ({widgetId, title, parameters, className}) => (
  <>
    <TypeformScript />
    <div
      data-tf-widget={widgetId}
      data-tf-opacity="100"
      data-tf-iframe-props={`title=${title}`}
      data-tf-transitive-search-params
      data-tf-medium="snippet"
      className={className}
      {...parameters}
    />
  </>
);

export const TypeformFullPageEmbed: FC<{
  widgetId: string,
  title: string,
  parameters?: Record<string, boolean | string>,
  className?: string,
}> = ({widgetId, title, parameters, className}) => (
  <TypeformStandardEmbed
    widgetId={widgetId}
    title={title}
    className={className}
    parameters={{
      "data-tf-inline-on-mobile": true,
      "data-tf-auto-focus": true,
      "data-tf-full-screen": true,
      ...parameters,
    }}
  />
);

export const TypeformPopupEmbed: FC<{
  widgetId: string,
  title: string,
  label?: string,
  parameters?: Record<string, boolean | string>,
  className?: string,
}> = ({widgetId, title, label, parameters, className}) => (
  <>
    <TypeformScript />
    <button
      data-tf-popup={widgetId}
      data-tf-opacity="100"
      data-tf-size="100"
      data-tf-iframe-props={`title=${title}`}
      data-tf-transitive-search-params
      data-tf-medium="snippet"
      className={className}
      {...parameters}
    >
      {label ?? title}
    </button>
  </>
);

/**
 * Defines when to open the side popup.
 * The default is "onClick" which waits for the button to be pressed.
 * "onLoad" opens the popup immediately on page load.
 * A number value between 0-100 opens the popup when the user scrolls that
 * percentage down the page.
 */
export type TypeformSideEmbedOpenBehaviour = "onClick" | "onLoad" | number;

export const TypeformSideEmbed: FC<{
  widgetId: string,
  title: string,
  label?: string,
  parameters?: Record<string, boolean | string>,
  openBehaviour?: TypeformSideEmbedOpenBehaviour,
  className?: string,
}> = ({
  widgetId,
  title,
  label,
  parameters,
  openBehaviour = "onClick",
  className,
}) => {
  const tfOpen = openBehaviour === "onClick"
    ? undefined
    : (openBehaviour === "onLoad" ? "load" : "scroll");
  const tfOpenValue = typeof openBehaviour === "number"
    ? String(openBehaviour)
    : undefined;
  return (
    <>
      <TypeformScript />
      <button
        data-tf-slider={widgetId}
        data-tf-position="right"
        data-tf-opacity="100"
        data-tf-iframe-props={`title=${title}`}
        data-tf-transitive-search-params
        data-tf-medium="snippet"
        data-tf-open={tfOpen}
        data-tf-open-value={tfOpenValue}
        className={className}
        {...parameters}
      >
        {label ?? title}
      </button>
    </>
  );
}
