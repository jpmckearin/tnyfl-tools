
const fs = require('fs');
const Crawler = require('crawler');
const Loki = require('lokijs');
const moment = require('moment');
const cTable = require('console.table');

const scoresPage = {
  uri: 'https://leagues.bluesombrero.com/Default.aspx',
  qs: {
    tabid: 689478,
    ProgramId: 80037731,
    DivisionId: 80255584
  },
  callback: parseScoresTable
}

const c = new Crawler({
  maxConnections: 10,
  callback: (err, res, done) => {
    if (err) {
      console.log(err)
    } else {
      let $ = res.$;
      console.log($('title').text());
    }
    done();
  }
});

const db = new Loki('./data/default.db');
const games = db.addCollection('games', { indices: ['awayTeam', 'homeTeam'] });
const teams = db.addCollection('teams', { indices: ['name'] });

c.queue(scoresPage);

function parseScoresTable(err, res, done) {
  if (err) {
    console.log(err)
  } else {
    getAllGames(res);
    getAllTeams(games.data);

    let results = [];
    teams.data.forEach(team => {
      const teamGames = getAllGamesForTeam(team);
      const {totalWins, totalLosses} = getTeamWinLosses(teamGames, team);
      results.push({
        name: team.name,
        totalWins,
        totalLosses,
        winPercentage: (totalWins / (totalWins + totalLosses)).toFixed(3),
        rpi: calculateRPI(teamGames, team),       
      })
    });
    results.sort((a,b) => (a.rpi < b.rpi) ? 1 : ((b.rpi < a.rpi) ? -1 : 0));

    console.table(results);
  }
  done();
}

function parseScore(score) {
  const [awayScore, homeScore] = score.split(' - ');
  return {awayScore, homeScore};
}

function getAllGames(res) {
  const $ = res.$;
  $('.rgMasterTable tbody tr').each((i, row) => {
    const children = $(row).children('td');
    const date = $(children[1]).text();
    const [startTime, endTime] = $(children[2]).text().split(' - ');
    const { awayScore, homeScore } = parseScore($(children[6]).text());
    const game = {
      startDate: moment(`${date} ${startTime}`, 'MM/DD/YYYY HH:mmA').utcOffset('-06:00'),
      endDate: moment(`${date} ${endTime}`, 'MM/DD/YYYY HH:mmA').utcOffset('-06:00'),
      location: $(children[3]).text(),
      awayTeam: $(children[4]).text(),
      homeTeam: $(children[5]).text(),
      awayScore: Math.trunc(awayScore),
      homeScore: Math.trunc(homeScore)
    };
    games.insert(game);
    db.saveDatabase();
  });
}

function getAllTeams(data) {
  const awayTeams = data.map(x => x.awayTeam);
  const homeTeams = data.map(x => x.homeTeam);
  const deduplicatedTeams = [...new Set([...awayTeams, ...homeTeams])];
  deduplicatedTeams.forEach(team => {
    teams.insert({ name: team });
  });
  db.saveDatabase();
}

function calculateRPI(teamGames, team) {
  const teamWP = getTeamWP(teamGames, team);
  const teamOWP = getTeamOWP(teamGames, team);
  const teamOOWP = getTeamOOWP(teamGames, team);
  const teamRPI = (0.4 * teamWP + 0.4 * teamOWP + 0.2 * teamOOWP).toFixed(4);
  return teamRPI;
}

function getTeamWinLosses(teamGames, team) {
  let totalWins = 0, totalLosses = 0;
  teamGames.forEach(game => {
    if (game.awayTeam === team.name && game.awayScore > game.homeScore) {
      totalWins++;
    } else if (game.homeTeam === team.name && game.homeScore > game.awayScore) {
      totalWins++;
    } else {
      totalLosses++;
    }
  });

  return {totalWins, totalLosses};
}

function getTeamWP(teamGames, team, teamToIgnore) {
  let totalWins = 0, totalGames = 0;
  teamGames.forEach(game => {
    if (teamToIgnore && (game.awayTeam === teamToIgnore.name || game.homeTeam == teamToIgnore.name)) {
      return;
    } else if (game.awayTeam === team.name && game.awayScore > game.homeScore) {
      totalWins++;
    } else if (game.homeTeam === team.name && game.homeScore > game.awayScore) {
      totalWins++;
    }
    totalGames++;
  });

  return +(totalWins / totalGames).toFixed(3);
}

function getTeamOWP(teamGames, team) {
  let owps = [];
  teamGames.forEach(game => {
    const opponentTeamName = getOpponentTeamName(game, team);
    const opponentTeamGames = getAllGamesForTeam({name: opponentTeamName});
    // this would calculate the WP without using games against the team we are considering
    // const owp = getTeamWP(opponentTeamGames, {name: opponentTeamName}, team);
    const owp = getTeamWP(opponentTeamGames, {name: opponentTeamName});
    owps.push(+owp);
  });

  return +(owps.reduce((total, owp) => total + owp) / owps.length).toFixed(3);
}

function getTeamOOWP(teamGames, team) {
  let oowps = [];
  teamGames.forEach(teamGame => {
    const opponentTeamName = getOpponentTeamName(teamGame, team);
    const opponentTeamGames = getAllGamesForTeam({name: opponentTeamName});
    opponentTeamGames.forEach(opponentTeamGame => {
      const ooTeamName = getOpponentTeamName(opponentTeamGame, opponentTeamName);
      const ooTeamGames = getAllGamesForTeam({name: ooTeamName});
      const oowp = getTeamWP(ooTeamGames, {name: ooTeamName});
      oowps.push(+oowp);
    });
  });

  return +(oowps.reduce((total, oowp) => total + oowp) / oowps.length).toFixed(3);
}

function getAllGamesForTeam({name}) {
  return games.where(game => {
    return (game.awayTeam === name || game.homeTeam === name);
  });
}

function getOpponentTeamName(game, team) {
  return game.awayTeam === team.name ? game.homeTeam : game.awayTeam
}

function getAllScores(data) {
  data.forEach(game => {
    const {awayScore, homeScore} = parseScore(game.score);
    console.log(`${game.awayTeam}: ${awayScore} - ${game.homeTeam}: ${homeScore}`);
  });
}

function writeToFile(body) {
  fs.writeFile(`${__dirname}/output.html`, body, err => {
    if (err) { 
      return console.log(err);
    }
  })
};

function log(data) {
  return console.log(JSON.stringify(data, null, 2));
};