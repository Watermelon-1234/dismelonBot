const { Client, GatewayIntentBits } = require('discord.js');
const { google } = require('googleapis');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');

// 讀取配置文件
const config = JSON.parse(fs.readFileSync('./config/config.json'));

// Discord bot token and channel ID
const DISCORD_TOKEN = config.DISCORD_TOKEN;
const CALENDAR_ID = config.CALENDAR_ID;  // Google Calendar ID
const CHANNEL_ID = config.CHANNEL_ID;  // 發送訊息的頻道
const CREDENTIALS_PATH = config.CREDENTIALS_PATH;  // Google API JSON key

// Setup Discord bot
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

// Google API Authentication
const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];
const auth = new google.auth.GoogleAuth({
  keyFile: CREDENTIALS_PATH,  // Google API JSON key
  scopes: SCOPES,
});
const calendar = google.calendar({ version: 'v3', auth });

// 用於記錄已發送提醒的活動
const sentReminders = new Set();

// 讀取已發送提醒的活動ID
function loadSentReminders() {
  try {
    const data = fs.readFileSync('./config/sentReminders.json', 'utf-8');
    return new Set(JSON.parse(data));
  } catch (error) {
    console.error('Error loading sent reminders:', error);
    return new Set();
  }
}

// 儲存已發送提醒的活動ID
function saveSentReminders() {
  try {
    fs.writeFileSync('./config/sentReminders.json', JSON.stringify(Array.from(sentReminders)), 'utf-8');
  } catch (error) {
    console.error('Error saving sent reminders:', error);
  }
}

// Get upcoming events
async function getUpcomingEvents() {
  try {
    console.log('Fetching upcoming events...');
    const res = await calendar.events.list({
      calendarId: CALENDAR_ID,
      timeMin: (new Date()).toISOString(),
      maxResults: 10,
      singleEvents: true,
      orderBy: 'startTime',
    });
    console.log('Events fetched successfully!');
    return res.data.items || [];
  } catch (error) {
    console.error('Error fetching events from Google Calendar:', error);
    return [];
  }
}

// Parse role ID from event description
function getRoleIdFromDescription(description) {
  const roleMatch = description ? description.match(/role:(\d+)/) : null;
  return roleMatch ? roleMatch[1] : null;  // 返回 role_id 或 null
}

// Find role ID by role name
async function findRoleIdByName(roleName) {
  try {
    const guild = client.guilds.cache.first();  // 假設機器人只在一個伺服器上
    if (!guild) throw new Error('No guild found.');

    const roles = guild.roles.cache;
    const role = roles.find(r => r.name === roleName);
    return role ? role.id : null;
  } catch (error) {
    console.error('Error finding role ID by name:', error);
    return null;
  }
}

// Send reminders to Discord
async function sendReminders() {
  console.log('Checking for upcoming events to send reminders...');
  const events = await getUpcomingEvents();
  const now = new Date();

  if (events.length === 0) {
    console.log('No upcoming events found.');
  } else {
    events.forEach(event => {
      const eventTime = new Date(event.start.dateTime || event.start.date);
      const eventStartDate = new Date(event.start.date);
      const timeDifference = eventTime - now;

      // 取得事件ID
      const eventId = event.id;

      // 只處理未提醒過的事件
      if (!sentReminders.has(eventId)) {
        const roleId = getRoleIdFromDescription(event.description);
        const channel = client.channels.cache.get(CHANNEL_ID);

        if (!channel) {
          console.error('Discord channel not found!');
          return;
        }

        // 計算提醒時間點
        const threeDaysBefore = new Date(eventStartDate);
        threeDaysBefore.setDate(threeDaysBefore.getDate() - 3);
        const oneDayBefore = new Date(eventStartDate);
        oneDayBefore.setDate(oneDayBefore.getDate() - 1);

        // 只有在三天前和一天前發送提醒
        if ((now.getTime() > threeDaysBefore.getTime() && now.getTime() <= eventStartDate.getTime()) ||
            (now.getTime() > oneDayBefore.getTime() && now.getTime() <= eventStartDate.getTime())) {
          let reminderMessage = `Reminder: ${event.summary} is starting on ${eventStartDate.toLocaleDateString()}`;
          if (roleId) {
            reminderMessage = `<@&${roleId}> ${reminderMessage}`;  // 標註指定的身份組
          }
          console.log(`Sending reminder: ${reminderMessage}`);
          channel.send(reminderMessage).catch(error => {
            console.error('Error sending message to Discord:', error);
          });

          // 標記為已發送提醒
          sentReminders.add(eventId);
        }
      }
    });

    // 儲存已發送的提醒
    saveSentReminders();
  }
}

// Schedule to run every minute
cron.schedule('* * * * *', () => {
  console.log('Running scheduled task to check events...');
  sendReminders().catch(error => {
    console.error('Error in scheduled task:', error);
  });
});

// Start bot
client.once('ready', () => {
  console.log('Bot is online and ready!');
  // 載入已發送的提醒
  Object.assign(sentReminders, loadSentReminders());
});

client.on('error', (error) => {
  console.error('Discord client encountered an error:', error);
});

client.login(DISCORD_TOKEN).catch(error => {
  console.error('Error logging in to Discord:', error);
});
