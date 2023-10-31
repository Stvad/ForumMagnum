export const eaGivingSeason23ElectionName = "givingSeason23";

export const donationElectionLink = "#"; // TODO
export const setupFundraiserLink = "#"; // TODO
export const postsAboutElectionLink = "/topics/donation-election"; // TODO

export const votingOpensDate = new Date("2023-12-01");

// TODO: This tag doesn't exist yet
export const donationElectionTagId = "L6NqHZkLc4xZ7YtDr";
export const effectiveGivingTagId = "L6NqHZkLc4xZ7YtDr";

type TimelinePoint = {
  date: Date,
  description: string,
}

type TimelineSpan = {
  start: Date,
  end: Date,
  description: string,
}

export type TimelineSpec = {
  start: Date,
  end: Date,
  points: TimelinePoint[],
  spans: TimelineSpan[],
}

export const timelineSpec: TimelineSpec = {
  start: new Date("2023-11-01"),
  end: new Date("2023-12-31"),
  points: [
    {date: new Date("2023-11-01"), description: "Election Fund opens"},
    {date: votingOpensDate, description: "Voting starts"},
    {date: new Date("2023-12-15"), description: "Voting ends"},
    {date: new Date("2023-12-31"), description: ""},
  ],
  spans: [
    {
      start: new Date("2023-11-07"),
      end: new Date("2023-11-14"),
      description: "Effective giving spotlight",
    },
    {
      start: new Date("2023-11-14"),
      end: new Date("2023-11-21"),
      description: "Marginal Funding Week",
    },
    {
      start: new Date("2023-11-21"),
      end: new Date("2023-11-28"),
      description: "Estimating cost-effectiveness",
    },
  ],
};
