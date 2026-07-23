export interface SeedMovie {
  id: string
  title: string
  year: number
  actor: string
  posterUrl: string
  // The original Wikipedia poster URL, kept as a fallback option rather than deleted —
  // see scripts/seed-movies.ts's POSTER_SOURCE env var. These are all UK "quad" cinema
  // posters, which are landscape (confirmed by measuring several: ~365x273px), not the
  // portrait one-sheet shape our poster grid assumes — that's why posterUrl itself now
  // points at TMDB's real portrait poster art (verified 500x750, true 2:3) instead.
  posterUrlWikipedia: string
}

/**
 * The 25 official Eon Productions James Bond films, in release order.
 * `id` here is only a stable slug used by scripts/migrate-legacy-export.ts to
 * resolve old exports by title — the backend assigns its own Movie ids.
 */
export const BOND_MOVIES: SeedMovie[] = [
  { id: 'dr-no', title: 'Dr. No', year: 1962, actor: 'Sean Connery', posterUrl: 'https://image.tmdb.org/t/p/w500/f9HsemSsBEHN5eoMble1bj6fDxs.jpg', posterUrlWikipedia: 'https://upload.wikimedia.org/wikipedia/en/thumb/4/43/Dr._No_-_UK_cinema_poster.jpg/330px-Dr._No_-_UK_cinema_poster.jpg' },
  { id: 'from-russia-with-love', title: 'From Russia with Love', year: 1963, actor: 'Sean Connery', posterUrl: 'https://image.tmdb.org/t/p/w500/zx4V17FP8oclNvOpTgs2iCCtiYk.jpg', posterUrlWikipedia: 'https://upload.wikimedia.org/wikipedia/en/a/ad/From_Russia_with_Love_%E2%80%93_UK_cinema_poster.jpg' },
  { id: 'goldfinger', title: 'Goldfinger', year: 1964, actor: 'Sean Connery', posterUrl: 'https://image.tmdb.org/t/p/w500/aKNFzaqQgPzsGXnsMc4kJH5hFIV.jpg', posterUrlWikipedia: 'https://upload.wikimedia.org/wikipedia/en/thumb/9/9a/Goldfinger_-_UK_cinema_poster.jpg/330px-Goldfinger_-_UK_cinema_poster.jpg' },
  { id: 'thunderball', title: 'Thunderball', year: 1965, actor: 'Sean Connery', posterUrl: 'https://image.tmdb.org/t/p/w500/wCc4qllaTDsQN8zgGkAgQrKO6N9.jpg', posterUrlWikipedia: 'https://upload.wikimedia.org/wikipedia/en/1/1f/Thunderball_-_UK_cinema_poster.jpg' },
  { id: 'you-only-live-twice', title: 'You Only Live Twice', year: 1967, actor: 'Sean Connery', posterUrl: 'https://image.tmdb.org/t/p/w500/9mvNd43HgTkbfPwX6MF6EoPIMIa.jpg', posterUrlWikipedia: 'https://upload.wikimedia.org/wikipedia/en/thumb/3/32/You_Only_Live_Twice_-_UK_cinema_poster.jpg/330px-You_Only_Live_Twice_-_UK_cinema_poster.jpg' },
  { id: 'on-her-majestys-secret-service', title: "On Her Majesty's Secret Service", year: 1969, actor: 'George Lazenby', posterUrl: 'https://image.tmdb.org/t/p/w500/m3KfbxvqaiAvRJ6MpguA3GuLdDQ.jpg', posterUrlWikipedia: 'https://upload.wikimedia.org/wikipedia/en/thumb/f/f3/On_Her_Majesty%27s_Secret_Service_-_UK_cinema_poster.jpg/330px-On_Her_Majesty%27s_Secret_Service_-_UK_cinema_poster.jpg' },
  { id: 'diamonds-are-forever', title: 'Diamonds Are Forever', year: 1971, actor: 'Sean Connery', posterUrl: 'https://image.tmdb.org/t/p/w500/ooDT0eKrWCxJCsn9JehPkD0QYNj.jpg', posterUrlWikipedia: 'https://upload.wikimedia.org/wikipedia/en/thumb/7/77/Diamonds_Are_Forever_-_UK_cinema_poster.jpg/330px-Diamonds_Are_Forever_-_UK_cinema_poster.jpg' },
  { id: 'live-and-let-die', title: 'Live and Let Die', year: 1973, actor: 'Roger Moore', posterUrl: 'https://image.tmdb.org/t/p/w500/39qkrjqMZs6utwNmihVImC3ghas.jpg', posterUrlWikipedia: 'https://upload.wikimedia.org/wikipedia/en/thumb/3/36/Live_and_Let_Die-_UK_cinema_poster.jpg/330px-Live_and_Let_Die-_UK_cinema_poster.jpg' },
  { id: 'the-man-with-the-golden-gun', title: 'The Man with the Golden Gun', year: 1974, actor: 'Roger Moore', posterUrl: 'https://image.tmdb.org/t/p/w500/xVkbKwGnBVNQ122GN5bCTMyPbWz.jpg', posterUrlWikipedia: 'https://upload.wikimedia.org/wikipedia/en/thumb/0/0c/The_Man_with_the_Golden_Gun_-_UK_cinema_poster.jpg/330px-The_Man_with_the_Golden_Gun_-_UK_cinema_poster.jpg' },
  { id: 'the-spy-who-loved-me', title: 'The Spy Who Loved Me', year: 1977, actor: 'Roger Moore', posterUrl: 'https://image.tmdb.org/t/p/w500/3ZxHKFxMYvAko680DsRgAZKWcLi.jpg', posterUrlWikipedia: 'https://upload.wikimedia.org/wikipedia/en/d/d7/The_Spy_Who_Loved_Me_%28UK_cinema_poster%29.jpg' },
  { id: 'moonraker', title: 'Moonraker', year: 1979, actor: 'Roger Moore', posterUrl: 'https://image.tmdb.org/t/p/w500/6LrJdXNmu5uHOVALZxVYd44Lva0.jpg', posterUrlWikipedia: 'https://upload.wikimedia.org/wikipedia/en/thumb/6/66/Moonraker_%28UK_cinema_poster%29.jpg/330px-Moonraker_%28UK_cinema_poster%29.jpg' },
  { id: 'for-your-eyes-only', title: 'For Your Eyes Only', year: 1981, actor: 'Roger Moore', posterUrl: 'https://image.tmdb.org/t/p/w500/xV4Nnr6DjjERlqNikqDQX8LUgua.jpg', posterUrlWikipedia: 'https://upload.wikimedia.org/wikipedia/en/thumb/c/cd/For_Your_Eyes_Only_-_UK_cinema_poster.jpg/330px-For_Your_Eyes_Only_-_UK_cinema_poster.jpg' },
  { id: 'octopussy', title: 'Octopussy', year: 1983, actor: 'Roger Moore', posterUrl: 'https://image.tmdb.org/t/p/w500/yoosZitM9igSk3Sd0sBXIhKlAh1.jpg', posterUrlWikipedia: 'https://upload.wikimedia.org/wikipedia/en/thumb/b/b2/Octopussy_-_UK_cinema_poster.jpg/330px-Octopussy_-_UK_cinema_poster.jpg' },
  { id: 'a-view-to-a-kill', title: 'A View to a Kill', year: 1985, actor: 'Roger Moore', posterUrl: 'https://image.tmdb.org/t/p/w500/arJF829RP9cYvh0NU70dC5TtXSa.jpg', posterUrlWikipedia: 'https://upload.wikimedia.org/wikipedia/en/thumb/0/03/A_View_to_a_Kill_-_UK_cinema_poster.jpg/330px-A_View_to_a_Kill_-_UK_cinema_poster.jpg' },
  { id: 'the-living-daylights', title: 'The Living Daylights', year: 1987, actor: 'Timothy Dalton', posterUrl: 'https://image.tmdb.org/t/p/w500/1oRlmWX9hewpn2B44wawBjHd7dx.jpg', posterUrlWikipedia: 'https://upload.wikimedia.org/wikipedia/en/a/ae/The_Living_Daylights_-_UK_cinema_poster.jpg' },
  { id: 'licence-to-kill', title: 'Licence to Kill', year: 1989, actor: 'Timothy Dalton', posterUrl: 'https://image.tmdb.org/t/p/w500/8nzJve63EXA79HGAyidZwivZrQ2.jpg', posterUrlWikipedia: 'https://upload.wikimedia.org/wikipedia/en/thumb/c/c2/Licence_to_Kill_-_UK_cinema_poster.jpg/330px-Licence_to_Kill_-_UK_cinema_poster.jpg' },
  { id: 'goldeneye', title: 'GoldenEye', year: 1995, actor: 'Pierce Brosnan', posterUrl: 'https://image.tmdb.org/t/p/w500/z0ljRnNxIO7CRBhLEO0DvLgAFPR.jpg', posterUrlWikipedia: 'https://upload.wikimedia.org/wikipedia/en/thumb/2/24/GoldenEye_-_UK_cinema_poster.jpg/330px-GoldenEye_-_UK_cinema_poster.jpg' },
  { id: 'tomorrow-never-dies', title: 'Tomorrow Never Dies', year: 1997, actor: 'Pierce Brosnan', posterUrl: 'https://image.tmdb.org/t/p/w500/gZm002w7q9yLOkltxT76TWGfdZX.jpg', posterUrlWikipedia: 'https://upload.wikimedia.org/wikipedia/en/thumb/b/b3/Tomorrow_Never_Dies_%28UK_cinema_poster%29.jpg/330px-Tomorrow_Never_Dies_%28UK_cinema_poster%29.jpg' },
  { id: 'the-world-is-not-enough', title: 'The World Is Not Enough', year: 1999, actor: 'Pierce Brosnan', posterUrl: 'https://image.tmdb.org/t/p/w500/wCb2msgoZPK01WIqry24M4xsM73.jpg', posterUrlWikipedia: 'https://upload.wikimedia.org/wikipedia/en/0/0c/The_World_Is_Not_Enough_%28UK_cinema_poster%29.jpg' },
  { id: 'die-another-day', title: 'Die Another Day', year: 2002, actor: 'Pierce Brosnan', posterUrl: 'https://image.tmdb.org/t/p/w500/bZmGqOhMhaLn8AoFMvFDct4tbrL.jpg', posterUrlWikipedia: 'https://upload.wikimedia.org/wikipedia/en/thumb/3/3d/Die_another_Day_-_UK_cinema_poster.jpg/330px-Die_another_Day_-_UK_cinema_poster.jpg' },
  { id: 'casino-royale', title: 'Casino Royale', year: 2006, actor: 'Daniel Craig', posterUrl: 'https://image.tmdb.org/t/p/w500/lMrxYKKhd4lqRzwUHAy5gcx9PSO.jpg', posterUrlWikipedia: 'https://upload.wikimedia.org/wikipedia/en/thumb/8/82/Casino_Royale_%282006_film_poster%29.jpg/330px-Casino_Royale_%282006_film_poster%29.jpg' },
  { id: 'quantum-of-solace', title: 'Quantum of Solace', year: 2008, actor: 'Daniel Craig', posterUrl: 'https://image.tmdb.org/t/p/w500/e3DXXLJHGqMx9yYpXsql1XNljmM.jpg', posterUrlWikipedia: 'https://upload.wikimedia.org/wikipedia/en/thumb/2/2d/Quantum_of_Solace_-_UK_cinema_poster.jpg/330px-Quantum_of_Solace_-_UK_cinema_poster.jpg' },
  { id: 'skyfall', title: 'Skyfall', year: 2012, actor: 'Daniel Craig', posterUrl: 'https://image.tmdb.org/t/p/w500/d0IVecFQvsGdSbnMAHqiYsNYaJT.jpg', posterUrlWikipedia: 'https://upload.wikimedia.org/wikipedia/en/thumb/a/a7/Skyfall_poster.jpg/330px-Skyfall_poster.jpg' },
  { id: 'spectre', title: 'Spectre', year: 2015, actor: 'Daniel Craig', posterUrl: 'https://image.tmdb.org/t/p/w500/zj8ongFhtWNsVlfjOGo8pSr7PQg.jpg', posterUrlWikipedia: 'https://upload.wikimedia.org/wikipedia/en/thumb/b/b9/Spectre_2015_poster.jpg/330px-Spectre_2015_poster.jpg' },
  { id: 'no-time-to-die', title: 'No Time to Die', year: 2021, actor: 'Daniel Craig', posterUrl: 'https://image.tmdb.org/t/p/w500/iUgygt3fscRoKWCV1d0C7FbM9TP.jpg', posterUrlWikipedia: 'https://upload.wikimedia.org/wikipedia/en/thumb/f/fe/No_Time_to_Die_poster.jpg/330px-No_Time_to_Die_poster.jpg' },
]
