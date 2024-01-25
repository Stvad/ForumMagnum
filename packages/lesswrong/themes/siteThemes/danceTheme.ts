import {eaForumTheme} from './eaTheme.ts'

export const danceForumTheme: SiteThemeSpecification = {
  ...eaForumTheme,
  make: (palette: ThemePalette) => {
    const eaForum = eaForumTheme.make!(palette)
    return {
      ...eaForum,
      overrides: {
        ...eaForum.overrides,
        LocalGroupsItem: {
          // todo default causes text to cut off in the friendly ui mode for some reason
          title: {
            lineHeight: "unset",
          },
          links: {
            // 🤔 this is obviously good if we have same number of links, but unclear for the case of varied number of flairs and links
            display: "flex",
            justifyContent: "flex-end",
          }
        }
      }
    }
  }
}
