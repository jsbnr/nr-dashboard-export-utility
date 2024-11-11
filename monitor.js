const DASH_GUID     = "DASHBOARD_GUID"                          // GUID of dashboard (click the i icon next to dashbaord name to find)
const SLACK_SUBJECT = "A title of your choice here"                     // a title (optional)
const SLACK_LINK    = "https://one.nr/your-dashboard-link"              // link to dashboard (or another!) (optional)

//If you want to only run when an alert is in progress... (note this uses NRAiIncident, you might want to change that)
const ACCOUNT_ID     = "0" 
const POLICY_NAME    = "" //name of your alert policy

const WIDTH         = 2000 //width of snapshot
const NR_HOST       = "https://api.newrelic.com/graphql"        // Using EU datacenter? use instead: https://api.eu.newrelic.com/graphiql
const API_KEY       = $secure.DASHEXP_API_KEY       // New Relic personal API Key for creating snapshot via graphQL
const SLACK_URL     = $secure.DASHEXP_SLACK_URL     // Slack webhook URL,e.g.  https://hooks.slack.com/services/xxxxx

const assert = require("assert")
const got = require("got");


async function asyncForEach(array, callback) {
  for (let index = 0; index < array.length; index++) {
    await callback(array[index], index, array);
  }
}

const getDashboardPages = async (apikey, guid) => {
  try {
    console.log("In getDashboardPages: apiKey: " + apikey + " guid: " + guid);
    const response = await got.post(NR_HOST, {
      headers: {
        "Content-Type": "application/json",
        "API-Key": apikey
      },
      json: {
        query: `{
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
        }`
      },
      responseType: "json"
    });

    const entities = response.body.data.actor.entitySearch.results.entities;
    if (!entities || entities.length === 0) {
      throw new Error("No entities found");
    }
    return entities.length > 1
      ? entities.filter(e => e.dashboardParentGuid !== null)
      : [entities[0]];

  } catch (error) {
    throw new Error("Error fetching dashboard pages: " + error.message);
  }
};

const generateSnapshot = async (apikey, guid) => {
  try {
    const response = await got.post(NR_HOST, {
      headers: {
        "Content-Type": "application/json",
        "API-Key": apikey
      },
      json: {
        query: `mutation { dashboardCreateSnapshotUrl(guid: \"${guid}\") }`
      },
      responseType: "json"
    });

    const snapshotUrl = response.body.data.dashboardCreateSnapshotUrl;
    if (!snapshotUrl) throw new Error("Snapshot URL not found in response");
    console.log("Snapshot URL:", snapshotUrl);
    return snapshotUrl;

  } catch (error) {
    throw new Error("Error generating snapshot: " + error.message);
  }
};

const checkAlertState = async (apikey, accountId, policyName) => {
  const gql = `{
    actor {
      account(id: ${accountId}) {
        nrql(query: "select latest(event) as 'state' from NrAiIncident where policyName='${policyName}'") {
          results
        }
      }
    }
  }`;

  try {
    const response = await got.post(NR_HOST, {
      headers: {
        "Content-Type": "application/json",
        "API-Key": apikey
      },
      json: { query: gql },
      responseType: "json"
    });

    const state = response.body.data.actor.account.nrql.results[0]?.state;
    if (!state) throw new Error("No NRQL data received for results.");
    return state;

  } catch (error) {
    throw new Error("Error checking alert state: " + error.message);
  }
};

const notifySlack = async function(url, subject, imageUrl, link) {
  try {
    let blocks = [];
    
    if (subject) {  // Add a subject title if there is one
      blocks.push({
        "type": "header",
        "text": {
          "type": "plain_text",
          "text": subject,
          "emoji": true
        }
      });
    }

    if (imageUrl) {
      blocks.push({
        "type": "image",
        "title": {
          "type": "plain_text",
          "text": "Dashboard snapshot",
          "emoji": true
        },
        "image_url": imageUrl,
        "alt_text": subject
      });
    }

    if (link) {
      blocks.push({
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
      });
    }

    console.log("Posting message to Slack...");
    
    const response = await got.post(url, {
      json: {
        blocks: blocks
      },
      responseType: 'text'  // Expecting a plain "OK" response as text
    });

    if (response.body === "OK" || response.body === "ok") {
      console.log("Message successfully posted to Slack.");
    } else {
      throw new Error("Unexpected response: " + response.body);
    }
  } catch (error) {
    console.error("Error notifying Slack:", error.message);
    throw new Error("Error notifying Slack: " + error.message);
  }
};


async function run() {
  console.log("In Run method");
  try {
    const checkState = POLICY_NAME && POLICY_NAME !== "";
    let proceed = !checkState;
console.log("checkState: " + checkState);
    console.log("Proceed: " + proceed);
    if (checkState) {
      console.log("Checking alert state for " + POLICY_NAME);
      const state = await checkAlertState(API_KEY, ACCOUNT_ID, POLICY_NAME);
      if (state === "open") {
        console.log("Alert was discovered");
        proceed = true;
      } else {
        console.log("No alerts discovered");
      }
    }

    if (proceed) {
      console.log("Generating snapshots");
      const pages = await getDashboardPages(API_KEY, DASH_GUID);
      await asyncForEach(pages, async (page, zeroIdx) => {
        const PDF_URL = await generateSnapshot(API_KEY, page.guid);
        const PNG_URL = PDF_URL.replace("format=PDF", "format=PNG") + `&width=${WIDTH}`;
        console.log(`Posting page '${page.name}' to Slack...`);
        await notifySlack(SLACK_URL, `${SLACK_SUBJECT}${SLACK_SUBJECT ? " - " : ""}${page.name}`, PNG_URL, SLACK_LINK);
      });
    }

    assert.ok(true);

  } catch (error) {
    console.error("Error occurred!\n\n", error);
    assert.fail("Error occurred: " + error.message);
  }
}

run();
