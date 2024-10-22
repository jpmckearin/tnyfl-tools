import { writeFile } from 'fs'
import { chromium } from 'playwright'
import Loki from 'lokijs'

interface Team {
  name: string
}

interface Game {
  startDate: Date
  endDate: Date
  location: string
  awayTeam: Team
  homeTeam: Team
  awayScore: number
  homeScore: number
}

interface WinPercentage {
  teamId: string
}

var webpage = 'https://leagues.bluesombrero.com/Default.aspx?tabid=689478'

const db = new Loki('./data/default.db')
const games = db.addCollection<Game>('games', {
  indices: ['awayTeam', 'homeTeam']
})
const teams = db.addCollection<Team>('teams', { indices: ['name'] })
const winPercentages = db.addCollection<WinPercentage>('winPercentages', {
  indices: 'teamId'
})

function parseTime(time: string) {
  const [startTime, endTime] = time.split(' - ')
  return { startTime, endTime }
}

async function RunAsync(): Promise<void> {
  const browser = await chromium.launch({ headless: false })
  const page = await browser.newPage()
  await page.goto(webpage)

  await page.click('#dnn_ctr770072_ViewScores_dropDownDivisions_chzn')
  await page.click('#dnn_ctr770072_ViewScores_dropDownDivisions_chzn_o_2')
  await page.waitForLoadState('domcontentloaded')

  await page.click('#dnn_ctr770072_ViewScores_dropDownEvents_chzn')
  await page.click('#dnn_ctr770072_ViewScores_dropDownEvents_chzn_o_1')
  await page.waitForLoadState('domcontentloaded')

  await page.$$eval('.rgMasterTable tbody tr', (gameRows) => {
    return gameRows.map((gameRow) => {
      const date = gameRow.querySelector('td:nth-child(1)').textContent.trim()
      const { startTime, endTime } = parseTime(
        gameRow.querySelector('td:nth-child(2)').textContent.trim()
      )
      console.log(date, startTime, endTime)
    })
  })

  // $('.rgMasterTable tbody tr').each(($tr, i) => {
  //     if (i != 0) {

  //       const date = $(children[1]).text()
  //       const { startTime, endTime } = parseTime($(children[2]).text())
  //       const { awayScore, homeScore } = parseScore($(children[6]).text())
  //       const game: Game = {
  //         startDate: moment(`${date} ${startTime}`, 'MM/DD/YYYY HH:mmA').utcOffset('-06:00'),
  //         endDate: moment(`${date} ${endTime}`, 'MM/DD/YYYY HH:mmA').utcOffset('-06:00'),
  //         location: $(children[3]).text(),
  //         awayTeam: $(children[4]).text(),
  //         homeTeam: $(children[5]).text(),
  //         awayScore: Math.trunc(awayScore),
  //         homeScore: Math.trunc(homeScore)
  //       }
  //       games.insert(game)
  //       db.saveDatabase()
  //     }
  //   })

  await browser.close()
}

RunAsync().catch((e) => {
  throw e
})

//   getAllGames()
//     getAllTeams(games)

//     let results = new Array
//     let wps = new Array
//     teams.data.forEach(team => {
//       const teamGames = getAllGamesForTeam(team)
//       const { totalWins, totalLosses } = getTeamWinLosses(teamGames, team)
//       const winPercentage = (totalWins / (totalWins + totalLosses)).toFixed(3)

//       results.push({
//         name: team.name,
//         totalWins,
//         totalLosses,
//         winPercentage,
//         rpi: calculateRPI(teamGames, team),
//       })

//       wps.push({
//         teamId: team.$loki,
//         winPercentage
//       })
//     })
//     winPercentages.insert(wps)
//     results.sort((a, b) => (a.rpi < b.rpi) ? 1 : ((b.rpi < a.rpi) ? -1 : 0))

//     console.table(results)

// function parseScore(score: string) {
//   const [awayScore, homeScore] = score.split(' - ')
//   return { awayScore, homeScore }
// }

// // function selectStuff() {
// //   const programId = 80071232
// //   const divisionId = 80610997
// //   const seasonId = 80119987

// //   $('.')
// // }

// function getAllGames() {
//   $('.rgMasterTable tbody tr').each(($tr, i) => {
//     if (i != 0) {
//       const rowElement = $tr.get(0)
//       const children = rowElement.cells

//       const date = $(children[1]).text()
//       const { startTime, endTime } = parseTime($(children[2]).text())
//       const { awayScore, homeScore } = parseScore($(children[6]).text())
//       const game: Game = {
//         startDate: moment(`${date} ${startTime}`, 'MM/DD/YYYY HH:mmA').utcOffset('-06:00'),
//         endDate: moment(`${date} ${endTime}`, 'MM/DD/YYYY HH:mmA').utcOffset('-06:00'),
//         location: $(children[3]).text(),
//         awayTeam: $(children[4]).text(),
//         homeTeam: $(children[5]).text(),
//         awayScore: Math.trunc(awayScore),
//         homeScore: Math.trunc(homeScore)
//       }
//       games.insert(game)
//       db.saveDatabase()
//     }
//   })
// }

// function getAllTeams(games: Collection<Game>) {
//   const awayTeams = games.data.map(x => x.awayTeam)
//   const homeTeams = games.data.map(x => x.homeTeam)
//   const deduplicatedTeams = [...new Set([...awayTeams, ...homeTeams])]
//   deduplicatedTeams.forEach(team => {
//     teams.insert({ name: team })
//   })
//   db.saveDatabase()
// }

// function calculateRPI(teamGames, team) {
//   const teamWP = getTeamWP(teamGames, team)
//   const teamOWP = getTeamOWP(teamGames, team)
//   const teamOOWP = getTeamOOWP(teamGames, team)
//   const teamRPI = (0.4 * teamWP + 0.4 * teamOWP + 0.2 * teamOOWP).toFixed(4)
//   return teamRPI
// }

// function getTeamWinLosses(teamGames:, team) {
//   let totalWins = 0, totalLosses = 0
//   teamGames.forEach(game => {
//     if (game.awayTeam === team.name && game.awayScore > game.homeScore) {
//       totalWins++
//     } else if (game.homeTeam === team.name && game.homeScore > game.awayScore) {
//       totalWins++
//     } else {
//       totalLosses++
//     }
//   })

//   return { totalWins, totalLosses }
// }

// function getTeamWP(teamGames, team, teamToIgnore?) {
//   let totalWins = 0, totalGames = 0
//   teamGames.forEach(game => {
//     if (teamToIgnore && (game.awayTeam === teamToIgnore.name || game.homeTeam == teamToIgnore.name)) {
//       return
//     } else if (game.awayTeam === team.name && game.awayScore > game.homeScore) {
//       totalWins++
//     } else if (game.homeTeam === team.name && game.homeScore > game.awayScore) {
//       totalWins++
//     }
//     totalGames++
//   })

//   return +(totalWins / totalGames).toFixed(3)
// }

// function getTeamOWP(teamGames, team) {
//   let owps = new Array
//   teamGames.forEach(game => {
//     const opponentTeamName = getOpponentTeamName(game, team)
//     const opponentTeamGames = getAllGamesForTeam({ name: opponentTeamName })
//     // this would calculate the WP without using games against the team we are considering
//     // const owp = getTeamWP(opponentTeamGames, {name: opponentTeamName}, team)
//     const owp = getTeamWP(opponentTeamGames, { name: opponentTeamName })
//     owps.push(+owp)
//   })

//   return +(owps.reduce((total, owp) => total + owp) / owps.length).toFixed(3)
// }

// function getTeamOOWP(teamGames, team) {
//   let oowps = new Array
//   teamGames.forEach(teamGame => {
//     const opponentTeamName = getOpponentTeamName(teamGame, team)
//     const opponentTeamGames = getAllGamesForTeam({ name: opponentTeamName })
//     opponentTeamGames.forEach(opponentTeamGame => {
//       const ooTeamName = getOpponentTeamName(opponentTeamGame, opponentTeamName)
//       const ooTeamGames = getAllGamesForTeam({ name: ooTeamName })
//       const oowp = getTeamWP(ooTeamGames, { name: ooTeamName })
//       oowps.push(+oowp)
//     })
//   })

//   return +(oowps.reduce((total, oowp) => total + oowp) / oowps.length).toFixed(3)
// }

// function getAllGamesForTeam({ name }: {name: string}) {
//   return games.where(game => {
//     return (game.awayTeam === name || game.homeTeam === name)
//   })
// }

// function getOpponentTeamName(game, team) {
//   return game.awayTeam === team.name ? game.homeTeam : game.awayTeam
// }

// // function writeToFile(body) {
// //   writeFile(`${__dirname}/output.html`, body, err => {
// //     if (err) {
// //       return console.log(err)
// //     }
// //   })
// // }
