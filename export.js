#!/usr/bin/env node

/* 

Run example:

Download as PDF:
./export.js --guid "dashboard-guid-here" --apikey "api-key-here" --filename "myfilename.pdf" 

Slack:
./export.js --guid "dashboard-guid-here" --apikey "api-key-here" --slack "https://slack-webhook-url" --subject "Example subject line" --link "https://some-link-here"

*/


const {argv} = require('yargs')
.option('guid', {
  type: 'string',
  description: 'Dashboard GUID',
  demandOption: true
})
.option('apikey', {
  type: 'string',
  description: 'API Key',
  demandOption: true
})
.option('filename', {
  type: 'string',
  default: 'dashboard',
  description: 'Export filename prefix'
})
.option('format', {
  type: 'string',
  default: 'pdf',
  description: 'File output format - png or pdf'
})
.option('slack', {
  type: 'string',
  description: 'Slack webhook URL'
})
.option('subject', {
  type: '',
  description: 'Slack subject'
})
.option('link', {
  type: 'string',
  description: 'Slack link'
})

const DASH_GUID = argv['guid']  
const API_KEY = argv['apikey']   
const OUTPUT_FILENAME = argv['filename']  
const OUTPUT_FORMAT = argv['format']   
const NR_HOST   = "https://api.newrelic.com/graphql" // Using EU datacenter? use instead: https://api.eu.newrelic.com/graphiql
const SLACK_URL = argv['slack'] 
const SLACK_SUBJECT = argv['subject'] 
const SLACK_LINK = argv['link'] 


var https = require('https');
var fs = require('fs');
var $http = require("request"); 


async function asyncForEach(array, callback) {
  for (let index = 0; index < array.length; index++) {
    await callback(array[index], index, array);
  }
}

var download = function(url, dest, cb) {
  var file = fs.createWriteStream(dest);
  https.get(url, function(response) {
    response.pipe(file);
    file.on('finish', function() {
      file.close(cb);
    });
  }).on('error', function(err) { // Handle errors
    fs.unlink(dest); 
    if (cb) cb(err.message);
  });
};

var generateSnapshot = function(apikey,guid) {
  return new Promise((resolve, reject) => {
    let options = {
      url: NR_HOST,
      method: 'POST',
      headers : {
        "Content-Type": "application/json",
        "API-Key": apikey
      },
      body: JSON.stringify({
        "query": `mutation { dashboardCreateSnapshotUrl(guid: \"${guid}\")}`
      })
    }

    $http(options, function callback(error, response, body) {
      if(error) {
        reject(e)
      } else {
          try {
            let bodyObj=JSON.parse(body)
            if(bodyObj.data && bodyObj.data && bodyObj.data.dashboardCreateSnapshotUrl) {
              //console.log("Snapshot URL: ",bodyObj.data.dashboardCreateSnapshotUrl)
              resolve(bodyObj.data.dashboardCreateSnapshotUrl)
            } else {
              reject("Snapshot URL not found in body: "+body)
            }
            
          } catch (e) {
            reject(e)
          }
      }
    });
  })

}


var getDashboardPages = function(apikey,guid) {
  return new Promise((resolve, reject) => {
    let options = {
      url: NR_HOST,
      method: 'POST',
      headers : {
        "Content-Type": "application/json",
        "API-Key": apikey
      },
      body: JSON.stringify({
        "query": `{
          actor {
            entitySearch(query: "parentId ='${guid}' or id ='${guid}'") {
              results {
                entities {
                  guid
                  name
                  ... on DashboardEntityOutline {
                    guid
                    name
                    dashboardParentGuid
                  }
                }
              }
            }
          }
        }
        `
      })
    }

    $http(options, function callback(error, response, body) {
      if(error) {
        reject(e)
      } else {
          try {
            let bodyObj=JSON.parse(body)
            let entities=bodyObj.data.actor.entitySearch.results.entities
            if(entities.length > 0 ) {
              if(entities.length>1) {
                resolve(entities.filter((e)=>{return e.dashboardParentGuid!==null}))
              } else {
                resolve([entities[0]]) //one pager
              } 
            } else {
              reject("Error. No entities returned from search")
            }
            
          } catch (e) {
            reject(e)
          }
      }
    });
  })

}

var notifySlack = function(url,subject, imageUrl, link) {
  return new Promise((resolve, reject) => {

    let blocks=[]
    if(subject) {  //add a subject title if there is one
      blocks.push({
        "type": "header",
        "text": {
          "type": "plain_text",
          "text": subject,
          "emoji": true
        }
      })
    }
    if(imageUrl) {
      blocks.push(
        {
          "type": "image",
          "image_url": imageUrl,
          "alt_text": subject
        }
      )
   }
   if(link){
    blocks.push(
      {
        "type": "section",
        "text": {
          "type": "mrkdwn",
          "text": "View this dashboard live in New Relic"
        },
        "accessory": {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "View in New Relic",
            "emoji": true
          },
          "value": "click_me_123",
          "url": link,
          "action_id": "button-action"
        }
      }
    )
   }


    let options = {
      url: url,
      method: 'POST',
      headers : {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        "blocks": blocks
      })
    }

    $http(options, function callback(error, response, body) {
      if(error) {
        reject(e)
      } else {
          resolve()
      }
    });
  })

}


async function run() {
  let pages=await getDashboardPages(API_KEY,DASH_GUID)
  
  await asyncForEach(pages,async (page,zeroIdx)=>{
      let idx=zeroIdx+1
      let PDF_URL = await generateSnapshot(API_KEY,page.guid)
      if(SLACK_URL) {

        const PNG_URL=PDF_URL.replace("format=PDF","format=PNG")
        console.log(`Posting page '${page.name}' to slack...`)
        await notifySlack(SLACK_URL,`${SLACK_SUBJECT}${SLACK_SUBJECT=="" ? "" : " - "}${page.name}`,PNG_URL,SLACK_LINK)

        } else {
          let filename=`${OUTPUT_FILENAME}${pages.length>1 ? "_"+idx : ""}.${OUTPUT_FORMAT}`
          download(PDF_URL.replace("format=PDF",`format=${OUTPUT_FORMAT.toUpperCase()}`),filename,(e)=>{
            if(e) {
              console.log(`Something went wrong with download of file ${filename}`)
            } else {
              console.log(`Page '${page.name}' saved to ${filename}`)
            }
          })
        }

  })
  



}

run().catch((e)=>{
  console.log("Error occurred!\n\n",e)
  process.exit(1)
})

