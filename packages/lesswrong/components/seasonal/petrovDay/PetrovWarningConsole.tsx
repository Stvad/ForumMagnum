// TODO: Import component in components.ts
import React, { useEffect, useState } from 'react';
import { registerComponent, Components } from '@/lib/vulcan-lib';
import { gql, useQuery } from '@apollo/client';
import { useMulti } from '@/lib/crud/withMulti';
import { useCreate } from '@/lib/crud/withCreate';

const styles = (theme: ThemeType) => ({
  root: {

  },
  minutesRemaining: {
    fontSize: '.9rem',
    color: 'gray'
  },
  reportButton: {
    border: theme.palette.border.answerBorder,
    borderRadius: 6,
    margin: 10,
    padding: '10px 20px',
    fontSize: '1rem',
    cursor: 'pointer',
    '&:hover': {
      backgroundColor: theme.palette.grey[200]
    }
  }
});

export const PetrovWarningConsole = ({classes, currentUser, side}: {
  classes: ClassesType<typeof styles>,
  currentUser: UsersCurrent,
  side: 'east' | 'west'
}) => {
  const { PetrovWorldmapWrapper, PastWarnings } = Components;

  const { results: petrovDayActions = [], refetch: refetchPetrovDayActions } = useMulti({
    collectionName: 'PetrovDayActions',
    fragmentName: 'PetrovDayActionInfo',
    terms: {
      view: 'warningConsole',
      side: side,
      limit: 200
    },
    skip: !currentUser
  })
  const [lastReported, setLastReported] = useState<string | null>(null)

  const pastWarnings = side === 'east' ? petrovDayActions.filter(action => action.actionType === 'eastPetrovReport') : petrovDayActions.filter(action => action.actionType === 'westPetrovReport')
  const latestWarning = pastWarnings.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]?.createdAt || lastReported


  const STARTING_MINUTE = 0
  const canSendNewReport = lastReported ? false : (new Date().getTime() - new Date(latestWarning).getTime()) > 1000 * 60 * 50

  const currentMinute = new Date().getMinutes();
  console.log({currentMinute})
  const reportWindow = currentMinute >= STARTING_MINUTE && currentMinute < 60
  const minutesRemaining = Math.abs(currentMinute - STARTING_MINUTE)

  const { data, refetch: refetchCount } = useQuery(gql`
    query petrovDay2024Resolvers {
      PetrovDay2024CheckNumberOfIncoming {
        count
      }
    }
  `, {
    ssr: true,
    variables: {
      side
    }
  });
  const count = data?.PetrovDay2024CheckNumberOfIncoming?.count?.toLocaleString()

  const { create: createPetrovDayAction } = useCreate({
    collectionName: 'PetrovDayActions',
    fragmentName: 'PetrovDayActionInfo'
  })

  const handleReport = (incoming: boolean) => {
    if (!canSendNewReport || !reportWindow) return
    const reportActionType = incoming ? (side === 'east' ? 'eastPetrovNukesIncoming' : 'westPetrovNukesIncoming') : (side === 'east' ? 'eastPetrovAllClear' : 'westPetrovAllClear')
    void createPetrovDayAction({  
      data: {
        userId: currentUser._id,
        actionType: reportActionType,
      }
    }) 
    setLastReported(new Date().toISOString())
  }

  useEffect(() => {count
    const interval = setInterval(() => {
      refetchCount();
      refetchPetrovDayActions();
    }, 1000);
    return () => clearInterval(interval);
  }, [refetchCount, refetchPetrovDayActions]);

  if (currentMinute >= STARTING_MINUTE && currentMinute < 60) {
    return <PetrovWorldmapWrapper>
      <h1>{count} detected missiles</h1>
      {canSendNewReport && <div>
        <button className={classes.reportButton} onClick={() => handleReport(false)}>Report "All Clear"</button>
        <button className={classes.reportButton} onClick={() => handleReport(true)}>Report INCOMING NUKES</button>
      </div>}
      <PastWarnings petrovDayActions={petrovDayActions} side={side} />
    </PetrovWorldmapWrapper>;
  } else {
    return <PetrovWorldmapWrapper>
      <h2>Scanning...</h2>
      <div className={classes.minutesRemaining}>{minutesRemaining} minutes until next scan complete</div>
      <PastWarnings petrovDayActions={petrovDayActions} side={side} />
    </PetrovWorldmapWrapper>;
  }
}

const PetrovWarningConsoleComponent = registerComponent('PetrovWarningConsole', PetrovWarningConsole, {styles});

declare global {
  interface ComponentTypes {
    PetrovWarningConsole: typeof PetrovWarningConsoleComponent
  }
}
