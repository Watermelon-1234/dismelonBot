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
const REMINDED_EVENTS_PATH = config.REMINDED_EVENTS_PATH;  // 存儲已提醒事件的文件路徑

// Setup Discord bot
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageContent,
    GatewayIntentBits.GuildMembers,
  ]
});

// Google API Authentication
const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];
const auth = new google.auth.GoogleAuth({
  keyFile: CREDENTIALS_PATH,
  scopes: SCOPES,
});
const calendar = google.calendar({ version: 'v3', auth });

// 檢查並創建 JSON 文件（如果不存在）
function checkAndCreateJsonFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      // 如果文件不存在，創建一個空的 JSON 文件
      fs.writeFileSync(filePath, JSON.stringify([]), 'utf8');
      console.log(`Created empty JSON file at: ${filePath}`);
    }
  } catch (error) {
    console.error(`Error checking or creating file at ${filePath}:`, error);
  }
}

// 從 JSON 文件讀取已提醒事件
function loadRemindedEvents() {
  checkAndCreateJsonFile(REMINDED_EVENTS_PATH); // 檢查文件是否存在，若無則創建
  try {
    const data = fs.readFileSync(REMINDED_EVENTS_PATH, 'utf8');
    return new Set(JSON.parse(data));
  } catch (error) {
    console.error('Error loading reminded events:', error);
    return new Set();
  }
}

// 將已提醒事件寫入 JSON 文件
function saveRemindedEvents(events) {
  try {
    fs.writeFileSync(REMINDED_EVENTS_PATH, JSON.stringify([...events]), 'utf8');
    console.log('Reminded events saved successfully.');
  } catch (error) {
    console.error('Error saving reminded events:', error);
  }
}

// 獲取即將來臨的事件
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

// 從事件描述中獲取身份組 ID
function getRoleIdFromDescription(description, roleIdMap) {
  const roleMatch = description ? description.match(/role:(\d+)/) : null;
  if (roleMatch) {
    console.log(`Found role ID: ${roleMatch[1]}`);
    return roleMatch[1];
  }
  return null;
}

// 發送提醒
async function sendReminders() {
  console.log('Checking for upcoming events to send reminders...');
  const events = await getUpcomingEvents();
  const now = new Date();

  if (events.length === 0) {
    console.log('No upcoming events found.');
  } else {
    events.forEach(event => {
      const eventTime = new Date(event.start.date);
      const daysUntilEvent = Math.floor((eventTime - now) / (1000 * 60 * 60 * 24));

      // 檢查是否在提醒日期
      if ((daysUntilEvent === 3 || daysUntilEvent === 1) && !remindedEvents.has(event.id)) {
        const roleId = getRoleIdFromDescription(event.description, roleIdMap);
        const channel = client.channels.cache.get(CHANNEL_ID);

        if (!channel) {
          console.error('Discord channel not found!');
          return;
        }

        // 發送訊息並標註 role_id (如果存在)
        let reminderMessage = `Reminder: ${event.summary} is on ${eventTime.toLocaleDateString()}`;
        if (roleId) {
          reminderMessage = `<@&${roleId}> ${reminderMessage}`;  // 標註指定的身份組
        }
        console.log(`Sending reminder: ${reminderMessage}`);
        channel.send(reminderMessage).catch(error => {
          console.error('Error sending message to Discord:', error);
        });

        // 記錄已經提醒過的事件
        remindedEvents.add(event.id);
        saveRemindedEvents(remindedEvents);
      } else {
        console.log(`Event "${event.summary}" is not in the reminder window or already reminded.`);
      }
    });
  }
}

// Schedule to run every day at 00:00
cron.schedule('0 0 * * *', () => {
  console.log('Running scheduled task to check events...');
  sendReminders().catch(error => {
    console.error('Error in scheduled task:', error);
  });
});

// Start bot
client.once('ready', async () => {
  console.log('Bot is online and ready!');
  // Load role ID mapping
  const guild = client.guilds.cache.first(); // Assuming the bot is in at least one guild
  roleIdMap = await getRoleIdMap(guild);

  // Load reminded events from file
  remindedEvents = loadRemindedEvents();
});

client.on('error', (error) => {
  console.error('Discord client encountered an error:', error);
});

client.login(DISCORD_TOKEN).catch(error => {
  console.error('Error logging in to Discord:', error);
});
