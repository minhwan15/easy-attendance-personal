import { isNeisUrl } from './core.js';
import { APP_MESSAGE, PANEL_MESSAGE, isNotebookUrl, createQueueMessageHandler } from './bridge-core.js';

const receiveQueue = createQueueMessageHandler({
  extensionId: chrome.runtime.id,
  read: async () => (await chrome.storage.session.get('teacherNotebook')).teacherNotebook,
  write: state => chrome.storage.session.set({ teacherNotebook: state }),
  remove: () => chrome.storage.session.remove('teacherNotebook'),
  readCompleted: async () => (await chrome.storage.session.get('teacherNotebookCompleted')).teacherNotebookCompleted || [],
  recordCompleted: async entries => {
    const old=(await chrome.storage.session.get('teacherNotebookCompleted')).teacherNotebookCompleted||[];
    const merged=new Map(old.map(entry=>[entry.completionId,entry]));
    for(const entry of entries)merged.set(entry.completionId,entry);
    if(merged.size>2000)throw new Error('앱을 열어 완료 기록을 동기화한 뒤 다시 확인해 주세요.');
    await chrome.storage.session.set({teacherNotebookCompleted:[...merged.values()]});
  },
  ackCompleted: async ids => {
    const old=(await chrome.storage.session.get('teacherNotebookCompleted')).teacherNotebookCompleted||[];
    const done=new Set(ids);
    await chrome.storage.session.set({teacherNotebookCompleted:old.filter(entry=>!done.has(entry.completionId))});
  },
});
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if(message?.type===APP_MESSAGE&&message.protocol===1&&message.command==='open-panel'){
    if(sender?.id!==chrome.runtime.id||sender.frameId!==0||!isNotebookUrl(sender.url)||!isNotebookUrl(sender.tab?.url)||!Number.isInteger(sender.tab?.windowId)){
      respond({ok:false,error:'허용되지 않은 기록장 연결입니다.'});return;
    }
    // Invoke immediately: storage reads or other awaits would lose the click gesture.
    chrome.sidePanel.open({windowId:sender.tab.windowId}).then(()=>respond({ok:true}),()=>respond({ok:false,error:'도우미 창을 자동으로 열지 못했습니다. 확장 프로그램 아이콘으로 열어 주세요.'}));
    return true;
  }
  if (![APP_MESSAGE, PANEL_MESSAGE].includes(message?.type)) return;
  receiveQueue(message, sender).then(respond, () => respond({ ok: false, error: '입력 대기를 저장하지 못했습니다. 다시 보내 주세요.' }));
  return true;
});

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

async function updatePanel(tabId, url) {
  if (!url) return;
  await chrome.sidePanel.setOptions({ tabId, path: 'panel.html', enabled: isNeisUrl(url) || isNotebookUrl(url) }).catch(() => {});
}
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.status === 'complete') updatePanel(tabId, tab.url);
});
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (tab) updatePanel(tabId, tab.url);
});

