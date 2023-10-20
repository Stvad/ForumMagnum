import React, { useEffect, useRef, useState } from "react";
import { Components, registerComponent } from "../../lib/vulcan-lib";
import { useSingle } from "../../lib/crud/withSingle";
import { useMulti } from "../../lib/crud/withMulti";
import { conversationGetTitle } from "../../lib/collections/conversations/helpers";
import withErrorBoundary from "../common/withErrorBoundary";
import { Link } from "../../lib/reactRouterWrapper";
import { useLocation } from "../../lib/routeUtil";
import { useTracking } from "../../lib/analyticsEvents";
import { getBrowserLocalStorage } from "../editor/localStorageHandlers";
import { userCanDo } from "../../lib/vulcan-users";
import { useOnNotificationsChanged } from "../hooks/useUnreadNotifications";
import stringify from "json-stringify-deterministic";

const styles = (theme: ThemeType): JssStyles => ({
  conversationSection: {
    maxWidth: 568,
  },
  conversationTitle: {
    ...theme.typography.commentStyle,
    marginTop: 8,
    marginBottom: 12,
  },
  editor: {
    margin: '32px 0px',
    position: "relative",
  },
  backButton: {
    color: theme.palette.lwTertiary.main,
  },
  row: {
    display: "flex",
    justifyContent: "space-between",
  },
});

const ConversationWidget = ({
  conversationId,
  currentUser,
  scrollRef,
  classes,
}: {
  conversationId: string;
  currentUser: UsersCurrent;
  scrollRef: React.RefObject<HTMLDivElement>;
  classes: ClassesType;
}) => {
  // Count messages sent, and use it to set a distinct value for `key` on `NewMessageForm`
  // that increments with each message. This is a way of clearing the form, which works
  // around problems inside the editor related to debounce timers and autosave and whatnot,
  // by guaranteeing that it's a fresh set of react components each time.
  const [messageSentCount, setMessageSentCount] = useState(0);

  const stateSignatureRef = useRef(stringify({conversationId, numMessagesShown: 0}));

  const {
    results,
    refetch,
    loading: loadingMessages,
  } = useMulti({
    terms: {
      view: "messagesConversation",
      conversationId,
    },
    collectionName: "Messages",
    fragmentName: "messageListFragment",
    fetchPolicy: "cache-and-network",
    limit: 100000,
    enableTotal: false,
  });
  const { document: conversation, loading: loadingConversation } = useSingle({
    documentId: conversationId,
    collectionName: "Conversations",
    fragmentName: "ConversationsList",
  });
  const loading = loadingMessages || loadingConversation;

  console.log("ConversationWidget", { conversationId, conversation, results, loading })

  const { query } = useLocation();
  const { captureEvent } = useTracking();

  // Whenever either the number of messages changes, or the conversationId changes,
  // scroll to the bottom. This happens on pageload, and also happens when the messages
  // list is refreshed because of the useOnNotificationsChanged() call below, if the refresh
  // increased the message count.
  //
  // Note, if you're refreshing (as opposed to navigating or opening a new
  // tab), this can wind up fighting with the browser's scroll restoration (see
  // client/scrollRestoration.ts).
  useEffect(() => {
    const newNumMessages = results?.length ?? 0;
    const newStateSignature = stringify({conversationId, numMessagesShown: newNumMessages});
    if (newStateSignature !== stateSignatureRef.current) {
      stateSignatureRef.current = newStateSignature;
      setTimeout(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        } else {
          window.scroll({top: document.body.scrollHeight-550, behavior: 'smooth'})
        }
      }, 0);
    }
  }, [stateSignatureRef, results?.length, scrollRef, conversationId]);

  useOnNotificationsChanged(currentUser, () => refetch());

  // try to attribute this sent message to where the user came from
  const profileViewedFrom = useRef("");
  useEffect(() => {
    const ls = getBrowserLocalStorage();
    if (query.from) {
      profileViewedFrom.current = query.from;
    } else if (conversation && conversation.participantIds.length === 2 && ls) {
      // if this is a conversation with one other person, see if we have info on where the current user found them
      const otherUserId = conversation.participantIds.find((id) => id !== currentUser._id);
      const lastViewedProfiles = JSON.parse(ls.getItem("lastViewedProfiles"));
      profileViewedFrom.current = lastViewedProfiles?.find((profile: any) => profile.userId === otherUserId)?.from;
    }
  }, [query.from, conversation, currentUser._id]);

  const { SingleColumnSection, ConversationDetails, NewMessageForm, Error404, Loading, MessageItem, Typography } =
    Components;

  const renderMessages = () => {
    if (loading && !results) return <Loading />;
    if (!results?.length) return null;

    return (
      <div>
        {results.map((message) => (
          <MessageItem key={message._id} message={message} />
        ))}
      </div>
    );
  };

  if (loading && !results) return <Loading />;
  if (!conversation) return <Error404 />;

  const showModInboxLink = userCanDo(currentUser, "conversations.view.all") && conversation.moderator;

  return (
    <div className={classes.conversationSection}>
      <div className={classes.row}>
        {/* TODO add back in on mobile only */}
        {/* <Typography variant="body2" className={classes.backButton}>
          <Link to="/inbox"> Go back to Inbox </Link>
        </Typography> */}
        {showModInboxLink && (
          <Typography variant="body2" className={classes.backButton}>
            <Link to="/moderatorInbox"> Moderator Inbox </Link>
          </Typography>
        )}
      </div>
      <ConversationDetails conversation={conversation} hideOptions />
      {renderMessages()}
      <div className={classes.editor}>
        <NewMessageForm
          key={`sendMessage-${messageSentCount}`}
          conversationId={conversation._id}
          templateQueries={{ templateId: query.templateId, displayName: query.displayName }}
          successEvent={() => {
            setMessageSentCount(messageSentCount + 1);
            captureEvent("messageSent", {
              conversationId: conversation._id,
              sender: currentUser._id,
              participantIds: conversation.participantIds,
              messageCount: (conversation.messageCount || 0) + 1,
              ...(profileViewedFrom?.current && { from: profileViewedFrom.current }),
            });
          }}
        />
      </div>
    </div>
  );
};

const ConversationWidgetComponent = registerComponent("ConversationWidget", ConversationWidget, {
  styles,
  hocs: [withErrorBoundary],
});

declare global {
  interface ComponentTypes {
    ConversationWidget: typeof ConversationWidgetComponent;
  }
}
