要讓你的 Discord 機器人開機啟動並在背景執行，你可以將機器人設置為系統服務。這種方式可以確保機器人即使在重新啟動系統後仍然能自動啟動，並能夠在背景運行。以下是實現這些功能的步驟，適用於 Linux (例如 Ubuntu) 系統，通過 systemd 服務來管理開機自啟動和背景執行。

### 1. 將機器人設置為 systemd 服務

#### 創建 systemd 服務文件
首先，創建一個 `.service` 文件來描述你的機器人服務。通常位於 `/etc/systemd/system/` 下。

1. 使用以下命令創建並打開新的服務文件 (需要管理員權限)：
    ```bash
    sudo nano /etc/systemd/system/discord-bot.service
    ```

2. 在打開的文件中，加入以下內容：
    ```ini
    [Unit]
    Description=Discord Bot Service
    After=network.target

    [Service]
    ExecStart=/usr/bin/node /path/to/your/bot/index.js
    WorkingDirectory=/path/to/your/bot
    Restart=always
    User=your-username
    Environment=NODE_ENV=production
    StandardOutput=append:/path/to/your/log/output.log
    StandardError=append:/path/to/your/log/error.log

    [Install]
    WantedBy=multi-user.target
    ```

   - `ExecStart`：指定執行機器人的命令，確保指向你機器人主文件的路徑（例如 `/path/to/your/bot/index.js`）。
   - `WorkingDirectory`：設置機器人的工作目錄。
   - `Restart=always`：確保機器人如果出現問題或被手動停止，會自動重啟。
   - `User`：替換為運行該服務的系統用戶名，通常是你登錄的用戶。
   - `StandardOutput` 和 `StandardError`：將日誌輸出到指定的文件中（例如 `output.log` 和 `error.log`）。

3. 保存文件並退出編輯器。

#### 啟用並啟動服務
1. 重新加載 systemd 配置：
    ```bash
    sudo systemctl daemon-reload
    ```

2. 啟動機器人服務：
    ```bash
    sudo systemctl start discord-bot
    ```

3. 設置機器人在系統啟動時自動啟動：
    ```bash
    sudo systemctl enable discord-bot
    ```

### 2. 背景運行機器人

如果你不想使用 systemd，也可以手動在背景啟動機器人。

#### 使用 `nohup` 在背景執行
你可以使用 `nohup` 指令讓機器人在背景運行，即使關閉終端機，它也不會停止。

```bash
nohup node /path/to/your/bot/index.js > log/output.log 2> log/error.log &
```

- `nohup`：保持命令運行，即使終端被關閉。
- `&`：將命令在背景執行。
- `> log/output.log` 和 `2> log/error.log`：將標準輸出和錯誤輸出分別保存到日誌文件。

### 3. 關閉機器人

#### 關閉 systemd 服務
如果機器人是通過 systemd 運行的，你可以使用以下命令停止機器人：
```bash
sudo systemctl stop discord-bot
```

如果你想要禁用開機啟動：
```bash
sudo systemctl disable discord-bot
```

#### 關閉手動運行的機器人
如果你是手動在背景啟動機器人，你可以使用 `ps` 指令查找並終止機器人進程：

1. 查找運行中的 Node.js 進程：
    ```bash
    ps aux | grep node
    ```

2. 終止機器人進程（根據返回的 PID 值）：
    ```bash
    kill <PID>
    ```

### 總結：
- **systemd** 服務方式適合自動啟動和管理機器人，包括開機自啟和自動重啟。
- **nohup** 方式則更適合手動啟動並在終端關閉後仍保持背景運行。

