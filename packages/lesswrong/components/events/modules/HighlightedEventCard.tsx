import React from 'react';
import { Components, registerComponent, } from '../../../lib/vulcan-lib';
import { Link } from '../../../lib/reactRouterWrapper';
import { createStyles } from '@material-ui/core/styles';
import Card from '@material-ui/core/Card';
import { prettyEventDateTimes } from '../../../lib/collections/posts/helpers';
import { useTimezone } from '../../common/withTimezone';
import { cloudinaryCloudNameSetting } from '../../../lib/publicSettings';
import { useTracking } from '../../../lib/analyticsEvents';

// space pic for events with no img
export const DEFAULT_EVENT_IMG = 'https://res.cloudinary.com/cea/image/upload/w_800/Banner/yeldubyolqpl3vqqy0m6.jpg'

const styles = createStyles((theme: ThemeType): JssStyles => ({
  root: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    maxWidth: 800,
    height: 350,
    backgroundPosition: 'center',
    background: theme.palette.primary.main,
    textAlign: 'center',
    color: 'white',
    borderRadius: 0,
    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
    margin: 'auto',
    [theme.breakpoints.down('xs')]: {
      marginLeft: -4,
      marginRight: -4,
    }
  },
  content: {
    position: 'relative',
    background: 'inherit',
    padding: '10px 20px',
    overflow: 'visible',
    '&::before': {
      content: "''",
      position: 'absolute',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      background: 'inherit',
      filter: 'blur(12px)',
    }
  },
  text: {
    position: 'relative',
    zIndex: 1,
  },
  spinnerContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%'
  },
  spinner: {
    "& div": {
      backgroundColor: 'white',
    }
  },
  row: {
    marginTop: 8
  },
  title: {
    ...theme.typography.headline,
    fontSize: 36,
    color: 'white',
    marginTop: 0,
    marginBottom: 10,
    [theme.breakpoints.down('sm')]: {
      fontSize: 32,
    }
  },
  detail: {
    ...theme.typography.commentStyle,
    fontSize: 18,
    lineHeight: '1.4em',
    marginBottom: 8,
    '&:last-of-type': {
      marginBottom: 0
    }
  },
  addToCal: {
    ...theme.typography.commentStyle,
    position: 'absolute',
    top: 20,
    right: 20,
    [theme.breakpoints.down('sm')]: {
      display: 'none'
    }
  },

}))


const HighlightedEventCard = ({event, loading, classes}: {
  event?: PostsList,
  loading: boolean,
  classes: ClassesType,
}) => {
  const { timezone } = useTimezone()
  const { captureEvent } = useTracking()
  
  const getEventLocation = (event: PostsList): string => {
    if (event.onlineEvent) return 'Online'
    return event.location ? event.location.slice(0, event.location.lastIndexOf(',')) : ''
  }
  
  const { Loading } = Components
  
  const cloudinaryCloudName = cloudinaryCloudNameSetting.get()
  // the default img and color here should probably be forum-dependent
  const eventImg = event?.eventImageId ?
    `https://res.cloudinary.com/${cloudinaryCloudName}/image/upload/c_fill,g_custom,h_350,w_800/${event.eventImageId}` :
    DEFAULT_EVENT_IMG
  
  const cardBackground = {
    backgroundImage: `linear-gradient(rgba(0, 87, 102, 0.6), rgba(0, 87, 102, 0.6)), url(${eventImg})`
  }
  
  if (loading) {
    return <Card className={classes.root}>
      <div className={classes.spinnerContainer}>
        <Loading white />
      </div>
    </Card>
  }
  
  // if there's no event to show, default to showing EA Global
  if (!event) {
    return (
      <Card className={classes.root} style={cardBackground}>
        <div className={classes.content}>
          <div className={classes.text}>
            <h1 className={classes.title}>
              <a href="https://www.eaglobal.org/" onClick={() => captureEvent('highlightedEventClicked')}>
                Effective Altruism Global
              </a>
            </h1>
            <div className={classes.detail}>
              Conferences in various locations
            </div>
          </div>
        </div>
      </Card>
    )
  }

  return (
    <Card className={classes.root} style={cardBackground}>
      <div className={classes.content}>
        <div className={classes.text}>
          <div className={classes.detail}>
            {prettyEventDateTimes(event, timezone, true)}
          </div>
          <h1 className={classes.title}>
            <Link to={`/events/${event._id}/${event.slug}`} onClick={() => captureEvent('highlightedEventClicked')}>
              {event.title}
            </Link>
          </h1>
          <div className={classes.detail}>
            {getEventLocation(event)}
          </div>
        </div>
      </div>
    </Card>
  )
}

const HighlightedEventCardComponent = registerComponent('HighlightedEventCard', HighlightedEventCard, {styles});

declare global {
  interface ComponentTypes {
    HighlightedEventCard: typeof HighlightedEventCardComponent
  }
}