# CreatorBot

A Telegram bot that functions as a fully controlled on a Telegram channel, from generating articles using AI via the Groq API to taking actions based on channel and post statistics.

## Deployment

To deploy the bot, follow these steps:

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/your-username/CreatorBot.git
    cd CreatorBot
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Configure secrets:**
    This bot requires two secret keys to be set in your Cloudflare dashboard:
    - `BOT_TOKEN`: Your Telegram bot token.
    - `GROQ_API_KEY`: Your Groq API key.

    You can set these secrets by running the following commands:
    ```bash
    npx wrangler secret put BOT_TOKEN
    npx wrangler secret put GROQ_API_KEY
    ```

4.  **Deploy the bot:**
    ```bash
    npm run deploy
    ```

5.  **Set the webhook:**
    After deploying, you need to set the Telegram webhook to your Cloudflare Worker's URL. You can do this by sending a POST request to the Telegram API:
    ```bash
    curl -F "url=https://<your-worker-url>/webhook" "https://api.telegram.org/bot<your-bot-token>/setWebhook"
    ```

## Usage

Once the bot is deployed and added to your Telegram channel, you can use the following commands:

-   **/generate `<prompt>`**: Generates an article based on the provided prompt using the Groq API.
-   **/stats**: Retrieves and displays the number of members in the channel.
