# slack-chatgpt-bot

A ChatGPT Slack Bot.

This is a Slack app using [Slack's next-gen platform](https://api.slack.com/future/intro).
You'll need a Slack workspace on a _paid plan_ you can work on.

## Features

- You can talk to the bot by adding @mention.
- The bot keeps and uses a conversation history.
    - The history size can be specified as `MESSAGE_HISTORY_SIZE` in `env.ts`
    - Using [Slack Datastores](https://api.slack.com/future/datastores)
- You can invite the bot to any channel after installing. (via Slack workflow)
- You can configure a [system message](https://platform.openai.com/docs/guides/chat/introduction) of ChatGPT for each channel. (via Slack workflow)

<img width="500" src="https://user-images.githubusercontent.com/1413408/227261586-f7ff30e0-cfb9-4a27-a277-3f5dd0e72d80.png">

https://github.com/morishin/slack-chatgpt-bot/assets/1413408/ba7f104f-1049-420f-860c-dc1feb3c3191

## Usage

Firstly, install this app on your workspace as described in the [Development](#development) section.

### Invite your bot

1. Invite your bot via the slash command.

   <img src="https://github.com/morishin/slack-chatgpt-bot/assets/1413408/13a0b1e4-9704-4525-9834-46392e626e94" width="486"/>

1. Click "Start" and select channels where you would like the bot to work.

    <img width="371" src="https://user-images.githubusercontent.com/1413408/226386413-d2f65c07-a0f0-4610-8ace-4698e4219960.png">

### Configure a system message for ChatGPT API

1. Open the configuration dialog via the slash command.

    <img src="https://github.com/morishin/slack-chatgpt-bot/assets/1413408/d25b40ee-e882-4e70-9f80-7d9aa5543256" width="519"/>

1. Click "Start" and input a system message.

    <img width="374" src="https://user-images.githubusercontent.com/1413408/226388870-328e2fa2-8b91-4581-9101-225beb9d6457.png">

### Mention your bot

1. Mention your bot in a channel where the bot invited.

    <img width="500" src="https://user-images.githubusercontent.com/1413408/227261586-f7ff30e0-cfb9-4a27-a277-3f5dd0e72d80.png">

## Development

----

**Guide Outline**:

- [Setup](#setup)
  - [Install the Slack CLI](#install-the-slack-cli)
  - [Clone the Template](#clone-the-template)
- [Running Your Project Locally](#running-your-project-locally)
- [Deploying Your App](#deploying-your-app)
  - [Viewing Activity Logs](#viewing-activity-logs)
- [Project Structure](#project-structure)
- [Resources](#resources)

----

### Setup

Before getting started, make sure you have a development workspace where you
have permissions to install apps. If you don’t have one set up, go ahead and
[create one](https://slack.com/create). Also, please note that the workspace
requires any of [the Slack paid plans](https://slack.com/pricing).

#### Install the Slack CLI

To use this sample, you first need to install and configure the Slack CLI.
Step-by-step instructions can be found in our
[Quickstart Guide](https://api.slack.com/future/quickstart).

### Running Your Project Locally

#### Make environment file

Make `.env` and `env.ts` files and fill values.

```sh
$ cp .env.example .env
$ cp env.ts.example env.ts
```

#### Create a Link Trigger

[Triggers](https://api.slack.com/future/triggers) are what cause workflows to
run. These triggers can be invoked by a user, or automatically as a response to
an event within Slack.

A [link trigger](https://api.slack.com/future/triggers/link) is a type of
trigger that generates a **Shortcut URL** which, when posted in a channel or
added as a bookmark, becomes a link. When clicked, the link trigger will run the
associated workflow.

Link triggers are _unique to each installed version of your app_. This means
that Shortcut URLs will be different across each workspace, as well as between
[locally run](#running-your-project-locally) and
[deployed apps](#deploying-your-app).

When creating a trigger, you must select the workspace and environment that
you'd like to create the trigger in. Each workspace has a local development
version (denoted by `(dev)`), as well as a deployed version. Triggers created in
a local environment will only be available to use when running the application
locally.

To create "Invite ChatGPT bot" trigger, run the following
command:

```zsh
$ slack trigger create --trigger-def triggers/configure_channels_trigger.ts

? Select a workspace your-workspace TXXXXXXX
? Choose an app environment Local AXXXXXXXXXX

⚡ Trigger created
   Trigger ID:   FtXXXXXXXXXX
   Trigger Type: shortcut
   Trigger Name: Invite ChatGPT bot
   Trigger Created Time: 2023-03-21 00:06:03 +09:00
   Trigger Updated Time: 2023-03-21 00:06:03 +09:00
   URL: https://slack.com/shortcuts/FtXXXXXXXXXX/0faaaaaaaaaaaaaaaaaaaaaaaaaaa
```

After selecting a workspace and environment, the output provided will include
the link trigger Shortcut URL. Copy and paste this URL into a channel as a
message, or add it as a bookmark in a channel of the workspace you selected.

**Note: this link won't run the workflow until the app is either running locally
or deployed!** Read on to learn how to run your app locally and eventually
deploy it to Slack hosting.

#### Run app

While building your app, you can see your changes propagated to your workspace
in real-time with `slack run`. In both the CLI and in Slack, you'll know an app
is the development version if the name has the string `(dev)` appended.

```zsh
# Run app locally
$ slack run

Connected, awaiting events
```

Once running, click the
[previously created Shortcut URL](#create-a-link-trigger) associated with the
`(dev)` version of your app. This should start the included sample workflow.

To stop running locally, press `<CTRL> + C` to end the process.

### Datastores

If your app needs to store any data, a datastore would be the right place for
that. For an example of a datastore, see `datastores/sample_datastore.ts`. Using
a datastore also requires the `datastore:write`/`datastore:read` scopes to be
present in your manifest.

### Testing

For an example of how to test a function, see
`functions/sample_function_test.ts`. Test filenames should be suffixed with
`_test`.

Run all tests with `deno test`:

```zsh
$ deno test
```

### Deploying Your App

Once you're done with development, you can deploy the production version of your
app to Slack hosting using `slack deploy`:

```zsh
$ slack deploy
```

After deploying, [create a new link trigger](#create-a-link-trigger) for the
production version of your app (not appended with `(dev)`). Once the trigger is
invoked, the workflow should run just as it did in when developing locally.

```zsh
$ slack trigger create --trigger-def triggers/configure_channels_trigger.ts

? Select a workspace your-workspace TXXXXXXX
? Choose an app environment Local AXXXXXXXXXX

⚡ Trigger created
   Trigger ID:   FtXXXXXXXXXX
   Trigger Type: shortcut
   Trigger Name: Invite ChatGPT bot
   Trigger Created Time: 2023-03-21 00:06:03 +09:00
   Trigger Updated Time: 2023-03-21 00:06:03 +09:00
   URL: https://slack.com/shortcuts/FtXXXXXXXXXX/0faaaaaaaaaaaaaaaaaaaaaaaaaaa
```

```zsh
$ slack trigger create --trigger-def triggers/configure_system_message_trigger.ts

? Select a workspace your-workspace TXXXXXXX
? Choose an app environment Local AXXXXXXXXXX

⚡ Trigger created
   Trigger ID:   FtXXXXXXXXXX
   Trigger Type: shortcut
   Trigger Name: Configure ChatGPT system message
   Trigger Created Time: 2023-03-21 00:06:03 +09:00
   Trigger Updated Time: 2023-03-21 00:06:03 +09:00
   URL: https://slack.com/shortcuts/FtXXXXXXXXXX/0fbbbbbbbbbbbbbbbbbbbbbbbbbbbb
```

Also [set environment variables](https://api.slack.com/future/run#environment-variables) for the production version of your app. The `.env` will not be used when you run `slack deploy`.

```zsh
$ slack env add
? Choose a deployed environment <your workspace>
? Variable name OPENAI_API_KEY
? Variable value ***************************************************

 APP  <your app id>
✨  successfully added OPENAI_API_KEY to app environment variables
```

#### Viewing Activity Logs

Activity logs for the production instance of your application can be viewed with
the `slack activity` command:

```zsh
$ slack activity
```

### Project Structure

#### `manifest.ts`

The [app manifest](https://api.slack.com/future/manifest) contains the app's
configuration. This file defines attributes like app name and description.

#### `slack.json`

Used by the CLI to interact with the project's SDK dependencies. It contains
script hooks that are executed by the CLI and implemented by the SDK.

#### `/functions`

[Functions](https://api.slack.com/future/functions) are reusable building blocks
of automation that accept inputs, perform calculations, and provide outputs.
Functions can be used independently or as steps in workflows.

#### `/workflows`

A [workflow](https://api.slack.com/future/workflows) is a set of steps that are
executed in order. Each step in a workflow is a function.

Workflows can be configured to run without user input or they can collect input
by beginning with a [form](https://api.slack.com/future/forms) before continuing
to the next step.

#### `/triggers`

[Triggers](https://api.slack.com/future/triggers) determine when workflows are
executed. A trigger file describes a scenario in which a workflow should be run,
such as a user pressing a button or when a specific event occurs.

### Resources

To learn more about developing with the CLI, you can visit the following guides:

- [Creating a new app with the CLI](https://api.slack.com/future/create)
- [Configuring your app](https://api.slack.com/future/manifest)
- [Developing locally](https://api.slack.com/future/run)

To view all documentation and guides available, visit the
[Overview page](https://api.slack.com/future/overview).
