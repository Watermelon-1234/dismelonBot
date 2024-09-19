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
const SERVER_ID = config.SERVER_ID; // 替換成你的伺服器 ID

// Setup Discord bot
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ]
});

var remindedEvents = new Set();

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
  // 確認描述是否存在且能匹配 "role:(角色名稱)"
  const roleMatch = description ? description.match(/role:\((.*?)\)/) : null;
  
  if (roleMatch && roleMatch[1]) {
    const roleName = roleMatch[1]; // 取得角色名稱
    // 檢查 roleIdMap 是否有對應的角色名稱
    if (roleIdMap.has(roleName)) {
      const roleId = roleIdMap.get(roleName); // 取得對應的角色 ID
      console.log(`Found role ID for role "${roleName}": ${roleId}`);
      return roleId;
    } else {
      console.log(`Role name "${roleName}" not found in roleIdMap`);
    }
  } else {
    console.log('No role found in description');
  }
  
  return null;
}

// 獲取身份組 ID 映射
async function getRoleIdMap(guild) {
  try {
    const roles = await guild.roles.fetch(); // 主動獲取最新身份組
    const roleIdMap = new Map();
    roles.forEach(role => {
      roleIdMap.set(role.name, role.id); // 把角色名稱對應角色 ID
    });
    console.log('Role ID map loaded:', roleIdMap);
    return roleIdMap;
  } catch (error) {
    console.error('Error fetching roles:', error);
    return new Map(); // 返回一個空的 Map 以防錯誤
  }
}

// 發送提醒
async function sendReminders() {
  console.log('Checking for upcoming events to send reminders...');
  const events = await getUpcomingEvents();
  const now = new Date();

  if (events.length === 0) {
    console.error('No upcoming events found.');
  } else {
    events.forEach(event => {
      var eventTime;
      if(event.start.date)
      {
        eventTime = new Date(event.start.date);
        eventTime.setHours(0,0,0,0);
      }
      else if(event.start.dateTime) {
        eventTime = new Date(event.start.dateTime);
      } else {
        console.error('Unknown event start time format:', event.start);
        return;
      }
      const daysUntilEvent = Math.ceil((eventTime - now) / (1000 * 60 * 60 * 24));
      // console.log(daysUntilEvent);
      // 檢查是否在提醒日期
      if ((daysUntilEvent === 7 || daysUntilEvent === 3 || daysUntilEvent === 1 || daysUntilEvent === 0) && !remindedEvents.has(event.id)) {
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
        console.error(`Event "${event.summary}" is not in the reminder window or already reminded.`);
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

// 啟動機器人
client.once('ready', async () => {
  console.log('Bot is online and ready!');

  const guild = client.guilds.cache.get(SERVER_ID);
  
  if (!guild) {
    console.error(`Guild with ID ${SERVER_ID} not found!`);
    return;
  }

  // 重新載入身份組 ID 映射
  roleIdMap = await getRoleIdMap(guild);

  // 載入已提醒事件
  remindedEvents = loadRemindedEvents();

  console.log('Running scheduled task to check events...');
  sendReminders().catch(error => {
    console.error('Error in scheduled task:', error);
  });
});


client.on('error', (error) => {
  console.error('Discord client encountered an error:', error);
});

client.login(DISCORD_TOKEN).catch(error => {
  console.error('Error logging in to Discord:', error);
});

// 當伺服器中有新的身份組時，重新更新角色 ID 映射表
client.on('guildRoleCreate', async (role) => {
  console.log(`New role created: ${role.name} (${role.id})`);
  const guild = role.guild;
  roleIdMap = await getRoleIdMap(guild); // 更新身份組 ID 映射表
});

// 當身份組被刪除時，也可以處理
client.on('guildRoleDelete', async (role) => {
  console.log(`Role deleted: ${role.name} (${role.id})`);
  const guild = role.guild;
  roleIdMap = await getRoleIdMap(guild); // 更新身份組 ID 映射表
});