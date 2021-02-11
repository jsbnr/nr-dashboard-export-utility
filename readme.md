# Dashboard Export to File or Slack

This project contains two examples:

- a simple node command line script that lets you request a dashboard snapshot from New Relic and downloads as a PDF or send to slack as a message.
- a Synthetic monitor script that can send a New Relic Dashboard snapshot to slack


## Installing
For the export.js script simply run `npm install` to install dependencies.
For the New Relic synthetic monitor simply add to your script, setup the two necessary secure credentials.

## Running the CLI
To run you need a valid user license key and the GUID of the dashboard. (To find the GUID click the "i" icon next to the dashboard name). For the slack version you need to setup a slack webhook and provide it.

*Examples:*

Download as PDF:
```
./export.js --guid "dashboard-guid-here" --apikey "api-key-here" --filename "myfilename.pdf" 
```

Slack:
```
./export.js --guid "dashboard-guid-here" --apikey "api-key-here" --slack "https://slack-webhook-url" --subject "Example subject line" --link "https://some-link-here"
```

