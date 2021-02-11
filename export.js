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
  default: 'dashboard.pdf',
  description: 'Export filename'
})
.option('slack', {
  type: 'string',
  description: 'Slack webhook URL'
})
.option('subject', {
  type: 'string',
  description: 'Slack subject'
})
.option('link', {
  type: 'string',
  description: 'Slack link'
})

const DASH_GUID = argv['guid']  
const API_KEY = argv['apikey']   
const OUTPUT_FILENAME = argv['filename']   
const NR_HOST   = "https://api.newrelic.com/graphql" // Using EU datacenter? use instead: https://api.eu.newrelic.com/graphiql
const SLACK_URL = argv['slack'] 
const SLACK_SUBJECT = argv['subject'] 
const SLACK_LINK = argv['link'] 

var https = require('https');
var fs = require('fs');
var $http = require("request"); 


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
              console.log("Snapshot URL: ",bodyObj.data.dashboardCreateSnapshotUrl)
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

    console.log("Posting message to slack...")
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
  let PDF_URL = await generateSnapshot(API_KEY,DASH_GUID)
  if(SLACK_URL) {

    const PNG_URL=PDF_URL.replace("format=PDF","format=PNG")
    await notifySlack(SLACK_URL,SLACK_SUBJECT,PNG_URL,SLACK_LINK)

    } else {
      download(PDF_URL,OUTPUT_FILENAME,(e)=>{
        if(e) {
          console.log("Something went wrong with download of PDF")
        } else {
          console.log(`File saved to ${OUTPUT_FILENAME}`)
        }
      })
    }


}

run().catch((e)=>{
  console.log("Error occurred!\n\n",e)
  process.exit(1)
})

