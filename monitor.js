const DASH_GUID     = "GUID-GOES-HERE"  // GUID of dashboard
const SLACK_SUBJECT = "Your subject goes here"                       // a title (optional)
const SLACK_LINK    = "https://one.nr/your-link-here"              // link to dashboard (or another!) (optional)
const NR_HOST       = "https://api.newrelic.com/graphql"        // Using EU datacenter? use instead: https://api.eu.newrelic.com/graphiql

const API_KEY       = $secure.DASHEXP_API_KEY       // New Relic personal API Key for creating snapshot via graphQL
const SLACK_URL     = $secure.DASHEXP_SLACK_URL     // Slack webhook URL,e.g.  https://hooks.slack.com/services/xxxxx

const assert = require("assert")
var $http = require("request"); 


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
          "title": {
            "type": "plain_text",
            "text": "Dashboard snapshot",
            "emoji": true
        },
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
          if(response.statusCode==200) {
            resolve()
          } else {
              reject("Error posting to slack. "+body)
          }
      }
    });
  })

}


async function run() {
  const PDF_URL = await generateSnapshot(API_KEY,DASH_GUID)
  const PNG_URL=PDF_URL.replace("format=PDF","format=PNG")
  await notifySlack(SLACK_URL,SLACK_SUBJECT,PNG_URL,SLACK_LINK)
  assert.ok(true)
}

run().catch((e)=>{
  console.log("Error occurred!\n\n",e)
  assert.fail("Error occured")
})

