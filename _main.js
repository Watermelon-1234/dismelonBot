const { Client, GatewayIntentBits } = require('discord.js');
// const { express } = require('express')
const { google } = require('googleapis');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');

// 讀取配置文件
const config = JSON.parse(fs.readFileSync('./config/config.json'));

// const app = express();
// const PORT = config.PORT;

// Discord bot token and channel ID
const DISCORD_TOKEN = config.DISCORD_TOKEN;
const CALENDAR_ID = config.CALENDAR_ID;  // Google Calendar ID
const CHANNEL_ID = config.CHANNEL_ID;  // 發送訊息的頻道
const CREDENTIALS_PATH = config.CREDENTIALS_PATH;  // Google API JSON key

// Setup the express server
// app.get('/', (req, res) => {
//     res.send('Hello World');
//     }
// );

// Setup Discord bot
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

// Google API Authentication
const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];
const auth = new google.auth.GoogleAuth({
  keyFile: CREDENTIALS_PATH,  // Google API JSON key
  scopes: SCOPES,
});
const calendar = google.calendar({ version: 'v3', auth });

// Get upcoming events
async function getUpcomingEvents() {
  const res = await calendar.events.list({
    calendarId: CALENDAR_ID,
    timeMin: (new Date()).toISOString(),
    maxResults: 10,
    singleEvents: true,
    orderBy: 'startTime',
  });
  return res.data.items || [];
}

// Parse role ID from event description
function getRoleIdFromDescription(description) {
  const roleMatch = description ? description.match(/role:(\d+)/) : null;
  return roleMatch ? roleMatch[1] : null;  // 返回 role_id 或 null
}

// Send reminders to Discord
async function sendReminders() {
  const events = await getUpcomingEvents();
  const now = new Date();

  events.forEach(event => {
    const eventTime = new Date(event.start.dateTime || event.start.date);
    const timeDifference = eventTime - now;

    // 15分鐘內的事件
    if (timeDifference <= 15 * 60 * 1000 && timeDifference > 0) {
      const roleId = getRoleIdFromDescription(event.description);
      const channel = client.channels.cache.get(CHANNEL_ID);

      // 發送訊息並標註 role_id (如果存在)
      let reminderMessage = `Reminder: ${event.summary} is starting at ${eventTime.toLocaleTimeString()}`;
      console.log("got Reminder:", reminderMessage);
      if (roleId) {
        reminderMessage = `<@&${roleId}> ${reminderMessage}`;  // 標註指定的身份組
      }
      channel.send(reminderMessage);
    } else {
      console.log("got no Reminder");
    }
  });
}

// Schedule to run every minute
cron.schedule('* * * * *', () => {
  sendReminders();
});

// Start bot
client.once('ready', () => {
  console.log('Bot is online!');
});

client.login(DISCORD_TOKEN);

