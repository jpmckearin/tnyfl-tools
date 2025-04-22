import { parse } from "date-fns";

interface ResponseTeam {
  club: {
    id: number;
    name: string;
  };
  id: number;
  team: {
    id: number;
    name: string;
  };
}

interface ResponseSchedule {
  id: number;
  date_short: string;
  time: string;
  field: {
    name: string;
  };
  away_team_id: number;
  away_team_score: number;
  home_team_id: number;
  home_team_score: number;
  status: "Played" | "Scheduled";
}

interface Response {
  teams: ResponseTeam[];
  schedule: ResponseSchedule[];
}

interface TeamToDisplay {
  rank: number;
  name: string;
  wins?: number;
  losses?: number;
  WP?: string;
  oWP?: string;
  ooWP?: string;
  rpi?: string;
  tieBreaker?: number;
}

interface Team {
  id: number;
  name: string;
  wins?: number;
  losses?: number;
  winPercentage?: number;
  oWP?: number;
  ooWP?: number;
  rpi?: number;
  tieBreaker?: number;
}

interface Game {
  date: Date;
  location: string;
  awayTeamName: string;
  homeTeamName: string;
  awayScore: number;
  homeScore: number;
}

const responseFile = Bun.file("src/data/response.json");

RunAsync().catch((e) => {
  console.error(e);
  throw e;
});

async function RunAsync(): Promise<void> {
  let response: Response = await responseFile.json();

  const currentTeams: Team[] = response.teams.map((team) => {
    return {
      id: team.team.id,
      name: team.team.name,
    } as Team;
  });

  const currentGames: Game[] = response.schedule
    .filter((schedule) => schedule.status === "Played")
    .map((schedule) => {
      return {
        date: parse(
          `${schedule.date_short} ${schedule.time}`,
          "MMM dd, yyyy h:mm a",
          new Date()
        ),
        location: schedule.field.name,
        awayTeamName: currentTeams.find(
          (team) => team.id === schedule.away_team_id
        )?.name,
        awayScore: schedule.away_team_score,
        homeTeamName: currentTeams.find(
          (team) => team.id === schedule.home_team_id
        )?.name,
        homeScore: schedule.home_team_score,
      } as Game;
    });

  currentTeams
    .map((team) => {
      const teamGames = getAllGamesForTeam(team.name, currentGames);
      const { totalWins, totalLosses, totalTieBreaker } = getTeamWinLosses(
        teamGames,
        team
      );

      team.wins = totalWins;
      team.losses = totalLosses;
      team.winPercentage = totalWins / (totalWins + totalLosses);
      team.tieBreaker = totalTieBreaker;
      return team;
    })
    .map((team) => {
      const rpi = calculateRPI(team.name, currentGames, currentTeams);
      team.rpi = Number.parseFloat(rpi);
    });

  currentTeams.sort((a, b) => {
    if (a.rpi === b.rpi) {
      const tieBreakerGames = getAllGamesForTeam(a.name, currentGames);
      const forfeits = tieBreakerGames.filter(
        (game) =>
          (game.awayScore === 0 && game.homeScore === 1) ||
          (game.homeScore === 0 && game.awayScore === 1)
      );
      if (forfeits.length > 0) {
        return -1;
      }
      if (a.tieBreaker === b.tieBreaker) {
        const tieBreakerGame = tieBreakerGames.find((game) => {
          return game.awayTeamName === a.name || game.homeTeamName === a.name;
        });

        if (tieBreakerGame) {
          if (tieBreakerGame.awayTeamName === a.name) {
            return tieBreakerGame.awayScore > tieBreakerGame.homeScore ? -1 : 1;
          }
          return tieBreakerGame.homeScore > tieBreakerGame.awayScore ? -1 : 1;
        }
      }
      if (a.tieBreaker !== undefined && b.tieBreaker !== undefined) {
        return a.tieBreaker > b.tieBreaker ? -1 : 1;
      }
      return 0;
    }
    if (a.rpi !== undefined && b.rpi !== undefined) {
      return a.rpi > b.rpi ? -1 : 1;
    }
    return 0;
  });

  const tableOfRankings = new Array<TeamToDisplay>();
  currentTeams.map((team, i) =>
    tableOfRankings.push({
      rank: i + 1,
      name: team.name,
      wins: team.wins,
      losses: team.losses,
      WP: team.winPercentage?.toFixed(4),
      oWP: team.oWP?.toFixed(4),
      ooWP: team.ooWP?.toFixed(4),
      rpi: team.rpi?.toFixed(4),
      tieBreaker: team.tieBreaker,
    })
  );

  console.log(`\nStandings:`);
  console.table(tableOfRankings, [
    "rank",
    "name",
    "wins",
    "losses",
    "WP",
    "oWP",
    "ooWP",
    "rpi",
    "tieBreaker",
  ]);
  console.log("\n");
}

function calculateRPI(teamName: string, games: Game[], teams: Team[]) {
  const team = teams.find((team) => team.name === teamName);
  if (!team) throw new Error(`Team not found: ${teamName}`);

  if (team.winPercentage === null || team.winPercentage === undefined)
    throw new Error(`Team WP is undefined for team: ${team.name}`);

  const teamWP = team.winPercentage;

  const teamOWP = getTeamOWP(team.name, games, teams);
  if (teamOWP === null || teamOWP === undefined)
    throw new Error(`Team OWP is undefined for team: ${team.name}`);
  team.oWP = teamOWP;

  const teamOOWP = getTeamOOWP(team.name, games, teams);
  if (teamOOWP === null || teamOOWP === undefined)
    throw new Error(`Team OOWP is undefined for team: ${team.name}`);
  team.ooWP = teamOOWP;

  return (0.4 * teamWP + 0.4 * teamOWP + 0.2 * teamOOWP).toFixed(4);
}

function getTeamWinLosses(teamGames: Game[], team: Team) {
  let totalWins = 0;
  let totalLosses = 0;
  let totalTieBreaker = 0;

  for (const game of teamGames) {
    if (game.awayTeamName === team.name && game.awayScore > game.homeScore) {
      totalWins++;
      totalTieBreaker += getTieBreakerAmount(game.awayScore - game.homeScore);
    } else if (
      game.homeTeamName === team.name &&
      game.homeScore > game.awayScore
    ) {
      totalWins++;
      totalTieBreaker += getTieBreakerAmount(game.homeScore - game.awayScore);
    } else {
      totalLosses++;
    }
  }

  return { totalWins, totalLosses, totalTieBreaker };
}

function getTieBreakerAmount(scoreDifference: number): number {
  if (scoreDifference <= 8) return 10;
  if (scoreDifference > 8 && scoreDifference < 18) return 7;
  if (scoreDifference >= 18) return 3;
  throw new Error("Invalid score difference");
}

function getTeamOWP(teamName: string, games: Game[], teams: Team[]) {
  const owps = new Array();

  const teamGames = getAllGamesForTeam(teamName, games);

  for (const game of teamGames) {
    const opponentTeamName = getOpponentTeamName(teamName, game);
    const owp = teams.find(
      (team) => team.name === opponentTeamName
    )?.winPercentage;
    if (owp !== null && owp !== undefined) owps.push(+owp);
  }

  return owps.length > 0
    ? +(owps.reduce((total, owp) => total + owp) / owps.length).toFixed(4)
    : 0;
}

function getTeamOOWP(teamName: string, games: Game[], teams: Team[]) {
  const oowps = new Array();

  const teamGames = getAllGamesForTeam(teamName, games);

  for (const game of teamGames) {
    const opponentTeamName = getOpponentTeamName(teamName, game);
    const opponentTeamGames = getAllGamesForTeam(opponentTeamName, games);

    for (const opponentTeamGame of opponentTeamGames) {
      const ooTeamName = getOpponentTeamName(
        opponentTeamName,
        opponentTeamGame
      );
      const oowp = teams.find(
        (team) => team.name === ooTeamName
      )?.winPercentage;
      if (oowp !== null && oowp !== undefined) oowps.push(+oowp);
    }
  }

  return +(oowps.reduce((total, oowp) => total + oowp) / oowps.length).toFixed(
    4
  );
}

function getAllGamesForTeam(teamName: string, games: Game[]) {
  return games.filter(
    (game) => game.awayTeamName === teamName || game.homeTeamName === teamName
  );
}

function getOpponentTeamName(teamName: string, game: Game) {
  return game.awayTeamName === teamName ? game.homeTeamName : game.awayTeamName;
}
