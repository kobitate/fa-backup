
const cheerio = require('cheerio')
const axios = require('axios')
const { prompt, MultiSelect } = require('enquirer')
const yargs = require('yargs')
const fs = require('fs')
const path = require('path')

const root = 'https://www.furaffinity.net'
const directory = 'download'

function pageItems(page) {
  return page('.gallery figure figcaption p:first-of-type a').map((_, el) => page(el).attr('href')).toArray()
}

const download = async (groups) => {
  let i = 0
  let j = 0

  while (i < groups.length) {
    const groupTitle = groups[i].title
    while (j < groups[i].items.length) {
      let num = groups[i].items[j]
      num = num.split('/')
      num = num[num.length-2]
      const submission = await getSubmission(`${root}${groups[i].items[j]}`)
      const page = cheerio.load(submission.data)

      const audio = page('.audio-player').attr('src')
      const img = page('#submissionImg').attr('data-fullview-src')
      if (!(audio || img)) {
        return
      }
      const fileURL = `https:${audio || img}`
      let fileName = fileURL.split('/')
      fileName = fileName[fileName.length-1]

      console.log(`Downloading #${num} ${fileName}...`)

      const writer = fs.createWriteStream(path.resolve(__dirname, directory, groupTitle, encodeURI(fileName)))

      const file = await axios.get(encodeURI(fileURL), {
        responseType: 'stream'
      })

      file.data.pipe(writer)
      j++
    }
    i++
  }
}

const getSubmission = async (url) => await axios.get(url)

const writeJSON = (data) => {
  fs.writeFileSync('data.json', JSON.stringify(data))
}

const argv = yargs
  .scriptName('fa-backup')
  .usage('$0 <cmd> [args]')
  .command('json', 'Saves selected gallery data to a JSON file')
  .command('dl', 'Downloads files marked for download in the JSON file')
  .help()
  .alias('help', 'h')
  .argv


if (argv._.includes('json')) {
  prompt({
    type: 'input',
    name: 'username',
    message: 'Input your FA username'
  }).then(result => {
    const { username } = result
    const gallery = `${root}/gallery/${username}/`

    axios.get(gallery).then(result => {
      const { data } = result
      const $ = cheerio.load(data)

      const list = $('.user-folders li a');
      let choices = list.map((i, el) => ({ name: $(el).text().trim(), value: `${root}${$(el).attr('href')}` }))
      choices = [
        { name: 'main', value: gallery },
        ...choices
      ]

      const select = new MultiSelect({
        name: 'galleries',
        message: 'Select the galleries you wish to backup',
        choices,
        result(names) {
          return this.map(names)
        }
      })

      select.run().then(result => {
        const galleries = Object.keys(result).map(key => {
          return result[key];
        })

        const galleryItems = []
        
        galleries.forEach(async (gallery) => {
          let next = gallery
          let galleryData = {}
          while(next) {
            try {
              const galleryPage = await axios.get(next)
              const page = cheerio.load(galleryPage.data)
      
              const title = page('.user-folders li.active strong').text()
              const items = pageItems(page)

              if (!galleryData.items) {
                galleryData.title = title
                galleryData.items = items
              } else {
                galleryData.items.push(...items)
              }

              const nextPageLink = page('.submission-list .aligncenter .inline:last-of-type form').attr('action')
              next = nextPageLink ? `${root}${nextPageLink}` : null
              // console.log(next)
            } catch (e) {
              console.error(e)
            }
          }
          galleryItems.push(galleryData)
          writeJSON(galleryItems)
        })
      })

    })
  })
} else if (argv._.includes('dl')) {
  let groups
  try {
    groups = fs.readFileSync('data.json')
    groups = JSON.parse(groups)
  } catch (e) {
    console.error('Please run the JSON command first')
    console.error(e)
    process.exit()
  }

  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory)
  }

  download(groups)

}