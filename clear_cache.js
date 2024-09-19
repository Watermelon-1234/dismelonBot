const fs = require('fs');

// 將空陣列寫入 JSON 檔案
fs.writeFile('./data/reminded_events.json', JSON.stringify([]), (err) => {
    if (err) {
        console.error('寫入檔案時發生錯誤:', err);
    } else {
        console.log('檔案已成功設為空陣列');
    }
});
