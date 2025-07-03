const pBrowser = require("../../utils/pBrowser.js");
const path = require("path");
const fs = require("fs");
const { sleep } = require("../../utils/time.js");
const { getRandomInt } = require("../../utils/Random.js");
const { getExcelDataList } = require("../../utils/ExcelDataUtils");

// 配置
const TARGET_URL = 'https://www.cookie.fun/';
const SCREENSHOT_DIR = './screenshots';
const file = "../../data/x.xlsx";
var excelDataList = [];

function logWithTime(message, category = "INFO", itemData = null) {
    const timestamp = new Date().toLocaleString();
    const windowName = itemData ? itemData.windowName : '';
    const prefix = windowName ? `[${timestamp}] [${windowName}]` : `[${timestamp}]`;
    console.log(`${prefix} [${category}] ${message}`);
}

// 确保截图目录存在
function ensureScreenshotDir() {
    if (!fs.existsSync(SCREENSHOT_DIR)) {
        fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
        logWithTime(`创建截图目录: ${SCREENSHOT_DIR}`, "INFO");
    }
}

// 获取Excel数据
async function getExcelData() {
    excelDataList = await getExcelDataList(file);
    if (excelDataList.length == 0) {
        logWithTime(`请配置 ${file}`, "ERROR");
        return [];
    }
    
    // 筛选有效账号（有用户名和密码的）
    const validAccounts = excelDataList.filter(object => {
        return object.xusername && object.xpassword;
    });
    
    logWithTime(`总账号数: ${excelDataList.length}`, "INFO");
    logWithTime(`有效账号数: ${validAccounts.length}`, "INFO");
    
    return validAccounts;
}

// 打开浏览器
async function openBrowser(itemData) {
    logWithTime(`正在打开浏览器窗口...`, "BROWSER", itemData);
    try {
        const browser = await pBrowser.getBrowserByName(itemData.windowName);
        
        if (browser) {
            const browserObj = { [itemData.windowName]: browser };
            global.config.browsers.push(browserObj);
            logWithTime(`浏览器窗口打开成功`, "BROWSER", itemData);
            return browser;
        } else {
            logWithTime(`浏览器窗口打开失败`, "ERROR", itemData);
            return null;
        }
    } catch (err) {
        logWithTime(`打开浏览器异常: ${err.message}`, "ERROR", itemData);
        return null;
    }
}

// 随机浏览页面并截图
async function browseAndScreenshot(browser, itemData) {
    try {
        logWithTime(`开始浏览 ${TARGET_URL}`, "BROWSE", itemData);
        
        // 关闭多余页面，只保留一个
        const pages = await browser.pages();
        for (let i = pages.length - 1; i > 0; i--) {
            await pages[i].close();
            await sleep(500);
        }
        
        let page;
        if (pages.length > 0) {
            page = pages[0];
        } else {
            page = await browser.newPage();
        }
        
        // 设置页面大小
        await page.setViewport({ width: 1920, height: 1080 });
        
        // 访问主页
        logWithTime(`访问主页: ${TARGET_URL}`, "BROWSE", itemData);
        await page.goto(TARGET_URL, { waitUntil: "networkidle2", timeout: 30000 });
        await sleep(3000);
        
        // 截图主页
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const mainScreenshot = path.join(SCREENSHOT_DIR, `${itemData.windowName}_main_${timestamp}.png`);
        await page.screenshot({ path: mainScreenshot, fullPage: true });
        logWithTime(`主页截图保存: ${mainScreenshot}`, "SCREENSHOT", itemData);
        
        // 随机浏览页面
        const browseCount = getRandomInt(3, 8); // 随机浏览3-8个页面
        logWithTime(`计划随机浏览 ${browseCount} 个页面`, "BROWSE", itemData);
        
        for (let i = 0; i < browseCount; i++) {
            await sleep(getRandomInt(2000, 5000)); // 随机等待2-5秒
            
            try {
                // 查找页面上的链接
                const links = await page.evaluate(() => {
                    const allLinks = Array.from(document.querySelectorAll('a[href]'));
                    return allLinks
                        .map(link => ({
                            href: link.href,
                            text: link.textContent.trim()
                        }))
                        .filter(link => 
                            link.href && 
                            !link.href.includes('javascript:') &&
                            !link.href.includes('mailto:') &&
                            !link.href.includes('tel:') &&
                            link.href.startsWith('http') &&
                            link.text.length > 0
                        )
                        .slice(0, 20); // 最多取20个链接
                });
                
                if (links.length > 0) {
                    // 随机选择一个链接
                    const randomLink = links[getRandomInt(0, links.length - 1)];
                    logWithTime(`点击链接: ${randomLink.text} (${randomLink.href})`, "BROWSE", itemData);
                    
                    try {
                        // 尝试点击链接或直接导航
                        if (randomLink.href.includes(new URL(TARGET_URL).hostname)) {
                            // 同域名链接，直接导航
                            await page.goto(randomLink.href, { waitUntil: "networkidle2", timeout: 15000 });
                        } else {
                            // 外部链接，在新标签页打开
                            const newPage = await browser.newPage();
                            await newPage.setViewport({ width: 1920, height: 1080 });
                            await newPage.goto(randomLink.href, { waitUntil: "networkidle2", timeout: 15000 });
                            
                            // 截图外部页面
                            const extScreenshot = path.join(SCREENSHOT_DIR, `${itemData.windowName}_external_${i+1}_${timestamp}.png`);
                            await newPage.screenshot({ path: extScreenshot, fullPage: true });
                            logWithTime(`外部页面截图: ${extScreenshot}`, "SCREENSHOT", itemData);
                            
                            await newPage.close();
                            continue;
                        }
                    } catch (navError) {
                        logWithTime(`导航失败: ${navError.message}`, "ERROR", itemData);
                        continue;
                    }
                } else {
                    // 没有找到链接，尝试滚动页面
                    logWithTime(`未找到可点击链接，执行页面滚动`, "BROWSE", itemData);
                    await page.evaluate(() => {
                        window.scrollBy(0, window.innerHeight * Math.random());
                    });
                }
                
                await sleep(2000);
                
                // 截图当前页面
                const pageScreenshot = path.join(SCREENSHOT_DIR, `${itemData.windowName}_page_${i+1}_${timestamp}.png`);
                await page.screenshot({ path: pageScreenshot, fullPage: true });
                logWithTime(`页面截图保存: ${pageScreenshot}`, "SCREENSHOT", itemData);
                
            } catch (browseError) {
                logWithTime(`浏览页面 ${i+1} 时出错: ${browseError.message}`, "ERROR", itemData);
                continue;
            }
        }
        
        // 最后回到主页
        logWithTime(`返回主页`, "BROWSE", itemData);
        await page.goto(TARGET_URL, { waitUntil: "networkidle2", timeout: 30000 });
        await sleep(2000);
        
        // 最终截图
        const finalScreenshot = path.join(SCREENSHOT_DIR, `${itemData.windowName}_final_${timestamp}.png`);
        await page.screenshot({ path: finalScreenshot, fullPage: true });
        logWithTime(`最终截图保存: ${finalScreenshot}`, "SCREENSHOT", itemData);
        
        logWithTime(`浏览任务完成，共截图 ${browseCount + 2} 张`, "SUCCESS", itemData);
        return true;
        
    } catch (error) {
        logWithTime(`浏览过程异常: ${error.message}`, "ERROR", itemData);
        return false;
    }
}

// 关闭所有浏览器
async function closeAllBrowser() {
    if (global.config && global.config.browsers) {
        global.config.browsers.forEach(object => {
            for (let key in object) {
                const bro = object[key];
                try {
                    bro.close();
                    logWithTime(`浏览器窗口关闭成功`, "BROWSER", { windowName: key });
                } catch (error) {
                    logWithTime(`关闭浏览器窗口异常: ${error.message}`, "ERROR", { windowName: key });
                }
            }
        });
        global.config.browsers = [];
    }
}

// 主函数
async function main() {
    logWithTime("=== Cookie.fun 采集脚本启动 ===", "MAIN");
    
    // 确保截图目录存在
    ensureScreenshotDir();
    
    // 获取账号数据
    const dataList = await getExcelData();
    if (dataList.length == 0) {
        logWithTime("没有有效账号，任务结束", "MAIN");
        return;
    }
    
    // 初始化全局配置
    global.config = {};
    global.config.browsers = [];
    global.config.userList = await pBrowser.getAllUserList();
    await sleep(2000);
    
    const batchSize = 3; // 一次处理3个窗口
    const accountsToProcess = Math.min(dataList.length, 10); // 最多处理10个账号
    
    logWithTime(`计划处理 ${accountsToProcess} 个账号`, "MAIN");
    
    // 分批处理
    for (let i = 0; i < accountsToProcess; i += batchSize) {
        const batchNumber = Math.floor(i / batchSize) + 1;
        const totalBatches = Math.ceil(accountsToProcess / batchSize);
        
        logWithTime(`=== 批次 ${batchNumber}/${totalBatches} ===`, "BATCH");
        
        let batchItems = [];
        
        // 准备当前批次的账号
        for (let j = i; j < i + batchSize && j < accountsToProcess; j++) {
            let itemData = dataList[j];
            const browser = await openBrowser(itemData);
            if (browser) {
                batchItems.push({ itemData, browser });
            }
        }
        
        if (batchItems.length === 0) {
            logWithTime("当前批次没有有效浏览器，跳过", "BATCH");
            continue;
        }
        
        await sleep(2000);
        
        // 调整窗口大小
        try {
            await pBrowser.reSizeWindow_3();
            await sleep(1000);
        } catch (error) {
            logWithTime(`调整窗口大小异常: ${error.message}`, "ERROR");
        }
        
        // 并行浏览
        logWithTime(`开始并行浏览 ${batchItems.length} 个窗口...`, "BATCH");
        const browseTasks = batchItems.map(({ itemData, browser }) => 
            browseAndScreenshot(browser, itemData)
        );
        const results = await Promise.all(browseTasks);
        
        // 统计结果
        const successCount = results.filter(result => result === true).length;
        const failCount = results.filter(result => result === false).length;
        
        logWithTime(`批次完成 - 成功: ${successCount}, 失败: ${failCount}`, "BATCH");
        
        await sleep(5000); // 批次间隔
        
        // 关闭当前批次的浏览器
        await closeAllBrowser();
        await sleep(2000);
    }
    
    logWithTime("=== Cookie.fun 采集脚本执行完成 ===", "MAIN");
    logWithTime(`截图保存目录: ${path.resolve(SCREENSHOT_DIR)}`, "FINAL");
    
    process.exit(0);
}

// 错误处理
main().catch(error => {
    logWithTime(`脚本执行异常: ${error.message}`, "ERROR");
    process.exit(1);
}); 