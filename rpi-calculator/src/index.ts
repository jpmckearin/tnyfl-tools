import moment from 'moment'
import { chromium, type Browser, type Page } from 'playwright'
import { readFile, writeFile } from 'jsonfile'
import * as fs from 'node:fs'

interface TeamToDisplay {
  rank: number
  name: string
  wins?: number
  losses?: number
  WP?: string
  oWP?: string
  ooWP?: string
  rpi?: string
  tieBreaker?: number
}

interface Team {
  division: Division
  name: string
  wins?: number
  losses?: number
  winPercentage?: number
  oWP?: number
  ooWP?: number
  rpi?: number
  tieBreaker?: number
}

interface Game {
  division: Division
  startDate: Date
  endDate: Date
  location: string
  awayTeamName: string
  homeTeamName: string
  awayScore: number
  homeScore: number
}

enum Division {
  blah = 0,
  '10U' = '10U',
  '10U D2' = '10U D2',
  '12U' = '12U',
  '12U D2' = '12U D2',
  '6U' = '6U',
  '6U D2' = '6U D2',
  '8U' = '8U',
  '8U D2' = '8U D2',
}

const scrapeFreshData = false
const gamesFile = 'src/data/games.json'
const teamsFile = 'src/data/teams.json'
const webpage = 'https://leagues.bluesombrero.com/Default.aspx?tabid=689478'
const divisionDropdownElementId =
  '#dnn_ctr770072_ViewScores_dropDownDivisions_chzn'
const divisionDropdownOptions = [
  {
    elementId: '#dnn_ctr770072_ViewScores_dropDownDivisions_chzn_o_1',
    division: Division['10U'],
  },
  {
    elementId: '#dnn_ctr770072_ViewScores_dropDownDivisions_chzn_o_2',
    division: Division['10U D2'],
  },
  {
    elementId: '#dnn_ctr770072_ViewScores_dropDownDivisions_chzn_o_3',
    division: Division['12U'],
  },
  {
    elementId: '#dnn_ctr770072_ViewScores_dropDownDivisions_chzn_o_4',
    division: Division['12U D2'],
  },
  {
    elementId: '#dnn_ctr770072_ViewScores_dropDownDivisions_chzn_o_5',
    division: Division['6U'],
  },
  {
    elementId: '#dnn_ctr770072_ViewScores_dropDownDivisions_chzn_o_6',
    division: Division['6U D2'],
  },
  {
    elementId: '#dnn_ctr770072_ViewScores_dropDownDivisions_chzn_o_7',
    division: Division['8U'],
  },
  {
    elementId: '#dnn_ctr770072_ViewScores_dropDownDivisions_chzn_o_8',
    division: Division['8U D2'],
  },
] as Array<{ elementId: string; division: Division }>

const teamsExcludedFromPlayoffs = ['Riverdale 10u D2']
const teamsExcludedFromRPI = ['Percy Priest 12u']

RunAsync().catch((e) => {
  console.error(e)
  throw e
})

async function RunAsync(): Promise<void> {
  let games = new Array<Game>()
  let teams = new Array<Team>()

  deleteFile(teamsFile)

  if (scrapeFreshData) {
    deleteFile(gamesFile)
    const browser = await chromium.launch({ headless: false })
    const page = await browser.newPage()
    await page.goto(webpage, { waitUntil: 'networkidle' })

    for (const option of divisionDropdownOptions) {
      await page.click(divisionDropdownElementId, { delay: 10 })
      await page.click(option.elementId, { delay: 10 })
      await page.waitForLoadState('domcontentloaded')

      const currentGames = await scrapeGames(page, option.division)
      games = [...games, ...currentGames]
    }

    await writeFile(gamesFile, games, { spaces: 2, flag: 'a' })

    await page.close()
    await browser.close()
  } else {
    games = await readFile(gamesFile)
  }

  for (const option of divisionDropdownOptions) {
    const currentGames = games.filter(
      (game: Game) =>
        game.division === option.division &&
        teamsExcludedFromRPI.includes(game.awayTeamName) === false &&
        teamsExcludedFromRPI.includes(game.homeTeamName) === false,
    )
    const currentTeams = scrapeTeams(currentGames, option.division)
    teams = [...teams, ...currentTeams]

    currentTeams.map((team) => {
      const rpi = calculateRPI(team.name, currentGames, currentTeams)
      team.rpi = Number.parseFloat(rpi)
    })

    currentTeams.sort((a, b) => {
      if (a.rpi === b.rpi) {
        const tieBreakerGames = getAllGamesForTeam(a.name, currentGames)
        const forfeits = tieBreakerGames.filter(
          (game) =>
            (game.awayScore === 0 && game.homeScore === 1) ||
            (game.homeScore === 0 && game.awayScore === 1),
        )
        if (forfeits.length > 0) {
          return -1
        }
        if (a.tieBreaker === b.tieBreaker) {
          const tieBreakerGame = tieBreakerGames.find((game) => {
            game.awayTeamName === a.name || game.homeTeamName === a.name
          })

          if (tieBreakerGame) {
            if (tieBreakerGame.awayTeamName === a.name) {
              return tieBreakerGame.awayScore > tieBreakerGame.homeScore
                ? -1
                : 1
            }
            return tieBreakerGame.homeScore > tieBreakerGame.awayScore ? -1 : 1
          }
        }
        if (a.tieBreaker !== undefined && b.tieBreaker !== undefined) {
          return a.tieBreaker > b.tieBreaker ? -1 : 1
        }
        return 0
      }
      if (a.rpi !== undefined && b.rpi !== undefined) {
        return a.rpi > b.rpi ? -1 : 1
      }
      return 0
    })

    const tableOfRankings = new Array<TeamToDisplay>()
    currentTeams
      .filter((team) => !teamsExcludedFromPlayoffs.includes(team.name))
      .map((team, i) =>
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
        }),
      )

    console.log(`\n${option.division?.toString()} Standings:`)
    console.table(tableOfRankings, [
      'rank',
      'name',
      'wins',
      'losses',
      'WP',
      'oWP',
      'ooWP',
      'rpi',
      'tieBreaker',
    ])
    console.log('\n')
  }

  await writeFile(teamsFile, teams, { spaces: 2, flag: 'a' })
}

export async function collectTableWithoutHeaders(input: {
  page: Page
  selector: string
}): Promise<string[][] | undefined> {
  const tables = await collectAllTableWithoutHeaders({ ...input, limit: 1 })
  return tables[0]
}

export function collectAllTableWithoutHeaders(input: {
  page: Page
  selector: string
  limit?: number
}): Promise<Array<string[][]>> {
  return input.page.evaluate(
    (input) => {
      const tables = document.querySelectorAll<HTMLTableElement>(input.selector)
      const result: Array<Array<Array<string>>> = []

      for (const table of tables) {
        const rows: Array<Array<string>> = []
        for (const tBody of table.tBodies) {
          row: for (const row of tBody.rows) {
            const cells: Array<string> = []
            for (let i = 0; i < row.cells.length; i++) {
              const cell = row.cells[i]
              if (cell.tagName === 'TH') continue row
              cells.push(cell.innerText)
            }
            rows.push(cells)
          }
        }
        result.push(rows)
        if (input.limit && result.length >= input.limit) break
      }

      return result
    },
    { selector: input.selector, limit: input.limit },
  )
}

function deleteFile(file: string) {
  fs.unlink(file, (err) => {
    if (err && err.code === 'ENOENT') {
      return
    }

    if (err) {
      // other errors, e.g. maybe we don't have enough permission
      console.error('Error occurred while trying to remove file', err)
    }
  })
}

function parseTime(time: string) {
  const [startTime, endTime] = time.split(' - ')
  return { startTime, endTime }
}

function parseScore(score: string): { awayScore: number; homeScore: number } {
  let [awayScore, homeScore] = score.split(' - ')
  awayScore = awayScore.trim()
  homeScore = homeScore.trim()
  return {
    awayScore: Number.parseInt(awayScore),
    homeScore: Number.parseInt(homeScore),
  }
}

async function scrapeGames(
  page: Page,
  division: Division,
): Promise<Array<Game>> {
  const games = new Array<Game>()
  const gameRows = await collectTableWithoutHeaders({
    page,
    selector: '.rgMasterTable',
  })

  for (const row of gameRows ?? []) {
    const date = row[1]
    const { startTime, endTime } = parseTime(row[2])
    const { awayScore, homeScore } = parseScore(row[6])
    const game: Game = {
      division,
      startDate: moment(`${date} ${startTime}`, 'MM/DD/YYYY HH:mmA')
        .utcOffset('-06:00')
        .toDate(),
      endDate: moment(`${date} ${endTime}`, 'MM/DD/YYYY HH:mmA')
        .utcOffset('-06:00')
        .toDate(),
      location: row[3],
      awayTeamName: row[4],
      homeTeamName: row[5],
      awayScore: Math.trunc(awayScore),
      homeScore: Math.trunc(homeScore),
    }
    games.push(game)
  }

  return games
}

function scrapeTeams(games: Game[], division: Division): Team[] {
  const teams = new Array<Team>()
  const awayTeamNames = games.map((x) => x.awayTeamName)
  const homeTeamNames = games.map((x) => x.homeTeamName)
  const deduplicatedTeamNames = [
    ...new Set([...awayTeamNames, ...homeTeamNames]),
  ]
  for (const name of deduplicatedTeamNames) {
    teams.push({ division, name })
  }

  teams.map((team) => {
    const teamGames = getAllGamesForTeam(team.name, games)
    const { totalWins, totalLosses, totalTieBreaker } = getTeamWinLosses(
      teamGames,
      team,
    )

    team.wins = totalWins
    team.losses = totalLosses
    team.winPercentage = totalWins / (totalWins + totalLosses)
    team.tieBreaker = totalTieBreaker
  })

  return teams
}

function calculateRPI(teamName: string, games: Game[], teams: Team[]) {
  const team = teams.find((team) => team.name === teamName)
  if (!team) throw new Error(`Team not found: ${teamName}`)

  if (team.winPercentage === null || team.winPercentage === undefined)
    throw new Error(`Team WP is undefined for team: ${team.name}`)

  const teamWP = team.winPercentage

  const teamOWP = getTeamOWP(team.name, games, teams)
  if (teamOWP === null || teamOWP === undefined)
    throw new Error(`Team OWP is undefined for team: ${team.name}`)
  team.oWP = teamOWP

  const teamOOWP = getTeamOOWP(team.name, games, teams)
  if (teamOOWP === null || teamOOWP === undefined)
    throw new Error(`Team OOWP is undefined for team: ${team.name}`)
  team.ooWP = teamOOWP

  return (0.4 * teamWP + 0.4 * teamOWP + 0.2 * teamOOWP).toFixed(4)
}

function getTeamWinLosses(teamGames: Game[], team: Team) {
  let totalWins = 0
  let totalLosses = 0
  let totalTieBreaker = 0

  for (const game of teamGames) {
    if (game.awayTeamName === team.name && game.awayScore > game.homeScore) {
      totalWins++
      totalTieBreaker += getTieBreakerAmount(game.awayScore - game.homeScore)
    } else if (
      game.homeTeamName === team.name &&
      game.homeScore > game.awayScore
    ) {
      totalWins++
      totalTieBreaker += getTieBreakerAmount(game.homeScore - game.awayScore)
    } else {
      totalLosses++
    }
  }

  return { totalWins, totalLosses, totalTieBreaker }
}

function getTieBreakerAmount(scoreDifference: number): number {
  if (scoreDifference <= 8) return 10
  if (scoreDifference > 8 && scoreDifference < 22) return 7
  if (scoreDifference >= 22 && scoreDifference < 33) return 3
  if (scoreDifference >= 33) return -5

  throw new Error('Invalid score difference')
}

function getTeamOWP(teamName: string, games: Game[], teams: Team[]) {
  const owps = new Array()

  const teamGames = getAllGamesForTeam(teamName, games)

  for (const game of teamGames) {
    const opponentTeamName = getOpponentTeamName(teamName, game)
    const owp = teams.find(
      (team) => team.name === opponentTeamName,
    )?.winPercentage
    if (owp !== null && owp !== undefined) owps.push(+owp)
  }

  return +(owps.reduce((total, owp) => total + owp) / owps.length).toFixed(4)
}

function getTeamOOWP(teamName: string, games: Game[], teams: Team[]) {
  const oowps = new Array()

  const teamGames = getAllGamesForTeam(teamName, games)

  for (const game of teamGames) {
    const opponentTeamName = getOpponentTeamName(teamName, game)
    const opponentTeamGames = getAllGamesForTeam(opponentTeamName, games)

    for (const opponentTeamGame of opponentTeamGames) {
      const ooTeamName = getOpponentTeamName(opponentTeamName, opponentTeamGame)
      const oowp = teams.find((team) => team.name === ooTeamName)?.winPercentage
      if (oowp !== null && oowp !== undefined) oowps.push(+oowp)
    }
  }

  return +(oowps.reduce((total, oowp) => total + oowp) / oowps.length).toFixed(
    4,
  )
}

function getAllGamesForTeam(teamName: string, games: Game[]) {
  return games.filter(
    (game) => game.awayTeamName === teamName || game.homeTeamName === teamName,
  )
}

function getOpponentTeamName(teamName: string, game: Game) {
  return game.awayTeamName === teamName ? game.homeTeamName : game.awayTeamName
}
