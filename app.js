'use strict';

/* ================= 常量 ================= */
var STORAGE_KEY = 'habit-checkin-v1';

var WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

var TINTS = [
  '#e3f0ff', '#ffe9e3', '#e5f7e8', '#f3e8ff',
  '#fff1d6', '#ffe3ec', '#e0f4f5', '#eceafd'
];

var PRESETS = [
  { name: '喝水', icon: '💧' },
  { name: '运动', icon: '🏃' },
  { name: '阅读', icon: '📖' },
  { name: '早睡', icon: '🌙' },
  { name: '冥想', icon: '🧘' },
  { name: '写作', icon: '✍️' },
  { name: '拉伸', icon: '🤸' },
  { name: '学习', icon: '📚' },
  { name: '少刷手机', icon: '📵' },
  { name: '记账', icon: '💰' }
];

var ICON_RULES = [
  [/水/, '💧'],
  [/运动|健身|锻炼|跑步|慢跑|走路|散步/, '🏃'],
  [/读|书/, '📖'],
  [/睡|眠/, '🌙'],
  [/冥想|呼吸/, '🧘'],
  [/写|日记|手帐|手账/, '✍️'],
  [/学|背单词|英语|单词/, '📚'],
  [/拉伸|瑜伽/, '🤸'],
  [/手机/, '📵'],
  [/钱|记账|存钱/, '💰'],
  [/水果|蔬菜|沙拉/, '🥗'],
  [/咖啡/, '☕'],
  [/整理|打扫|清洁|断舍离/, '🧹'],
  [/药|维生素/, '💊'],
  [/牙/, '🪥']
];

/* ================= 数据 ================= */
var state = loadState();

function loadState() {
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      var data = JSON.parse(raw);
      if (data && Array.isArray(data.habits)) {
        return {
          habits: data.habits,
          completions: data.completions && typeof data.completions === 'object' ? data.completions : {}
        };
      }
    }
  } catch (err) {
    console.warn('读取本地数据失败', err);
  }
  return { habits: [], completions: {} };
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    toast('保存失败：浏览器本地存储不可用');
  }
}

/* ================= 日期工具 ================= */
function pad2(n) { return String(n).padStart(2, '0'); }

function dateKey(d) {
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

function shiftDay(key, delta) {
  var d = new Date(key + 'T00:00:00');
  d.setDate(d.getDate() + delta);
  return dateKey(d);
}

function todayKey() { return dateKey(new Date()); }

function doneIdsOn(key) {
  var arr = state.completions[key];
  return arr ? new Set(arr) : new Set();
}

function isDoneOn(key, id) { return doneIdsOn(key).has(id); }
function isDoneToday(id) { return isDoneOn(todayKey(), id); }

function toggleToday(id) {
  var key = todayKey();
  if (!state.completions[key]) state.completions[key] = [];
  var arr = state.completions[key];
  var i = arr.indexOf(id);
  if (i >= 0) { arr.splice(i, 1); } else { arr.push(id); }
  saveState();
}

/* 连续坚持天数：今天已打卡就从今天算，否则从昨天往前算（今天还没打不算断） */
function streakOf(id) {
  var today = todayKey();
  var key = isDoneOn(today, id) ? today : shiftDay(today, -1);
  var n = 0;
  while (isDoneOn(key, id)) {
    n += 1;
    key = shiftDay(key, -1);
  }
  return n;
}

/* ================= DOM 引用 ================= */
var el = {
  weekRange: document.getElementById('weekRange'),
  weekBars: document.getElementById('weekBars'),
  weekSummary: document.getElementById('weekSummary'),
  dateTitle: document.getElementById('dateTitle'),
  statusText: document.getElementById('statusText'),
  ringBar: document.getElementById('ringBar'),
  ringDone: document.getElementById('ringDone'),
  ringTotal: document.getElementById('ringTotal'),
  listTitle: document.getElementById('listTitle'),
  habitList: document.getElementById('habitList'),
  emptyState: document.getElementById('emptyState'),
  addToggle: document.getElementById('addToggle'),
  addPanel: document.getElementById('addPanel'),
  presets: document.getElementById('presets'),
  addForm: document.getElementById('addForm'),
  newHabit: document.getElementById('newHabit'),
  modal: document.getElementById('modal'),
  modalText: document.getElementById('modalText'),
  modalOk: document.getElementById('modalOk'),
  modalCancel: document.getElementById('modalCancel'),
  toast: document.getElementById('toast')
};

/* ================= 渲染：顶部 ================= */
function updateHeader() {
  var now = new Date();
  var total = state.habits.length;
  var done = state.habits.filter(function (h) { return isDoneToday(h.id); }).length;

  el.dateTitle.textContent = (now.getMonth() + 1) + '月' + now.getDate() + '日 · ' + WEEK[now.getDay()];

  var ratio = total > 0 ? done / total : 0;
  el.ringBar.style.strokeDashoffset = String(100 * (1 - ratio));
  el.ringDone.textContent = String(done);
  el.ringTotal.textContent = '/ ' + total;

  var msg;
  if (total === 0) {
    msg = '先添加几个想坚持的习惯吧 👇';
  } else if (done === 0) {
    msg = '今天还没打卡，完成一项就打个勾 ✨';
  } else if (done < total) {
    msg = '已完成 ' + done + ' / ' + total + ' 项，继续加油 💪';
  } else {
    msg = '🎉 太棒了，今天的习惯全部完成！';
  }
  el.statusText.textContent = msg;
  el.statusText.classList.toggle('all-done', total > 0 && done === total);

  renderWeek();
}

/* ================= 渲染：本周统计 ================= */
/* 一周从周一开始 */
function weekStartKey() {
  var now = new Date();
  var offset = (now.getDay() + 6) % 7;
  var d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  d.setDate(d.getDate() - offset);
  return dateKey(d);
}

function weekDayKeys() {
  var start = weekStartKey();
  var keys = [];
  for (var i = 0; i < 7; i++) keys.push(shiftDay(start, i));
  return keys;
}

function countOn(key) {
  var arr = state.completions[key];
  return arr ? arr.length : 0;
}

function fmtMonthDay(key) {
  var parts = key.split('-');
  return parseInt(parts[1], 10) + '月' + parseInt(parts[2], 10) + '日';
}

function createWeekCell(label) {
  var li = document.createElement('li');
  li.className = 'wd';

  var day = document.createElement('span');
  day.className = 'wd-day';
  day.textContent = label;

  var num = document.createElement('span');
  num.className = 'wd-num';

  li.appendChild(day);
  li.appendChild(num);
  return li;
}

/* 本周每天完成几项，用数字展示 */
function renderWeek() {
  if (!el.weekBars) return;

  var keys = weekDayKeys();
  var today = todayKey();
  var counts = keys.map(countOn);
  var total = counts.reduce(function (sum, n) { return sum + n; }, 0);
  var activeDays = counts.filter(function (n) { return n > 0; }).length;

  el.weekRange.textContent = fmtMonthDay(keys[0]) + ' - ' + fmtMonthDay(keys[6]);

  if (el.weekBars.childElementCount !== 7) {
    el.weekBars.textContent = '';
    for (var i = 0; i < 7; i++) {
      el.weekBars.appendChild(createWeekCell(WEEK[(i + 1) % 7].slice(1)));
    }
  }

  keys.forEach(function (key, i) {
    var li = el.weekBars.children[i];
    li.classList.toggle('is-today', key === today);
    li.classList.toggle('is-future', key > today);
    li.classList.toggle('has-done', counts[i] > 0);
    li.title = WEEK[(i + 1) % 7] + '：完成 ' + counts[i] + ' 项';
    li.querySelector('.wd-num').textContent = String(counts[i]);
  });

  el.weekBars.setAttribute('aria-label',
    '本周每天完成项数：共 ' + total + ' 项，坚持 ' + activeDays + ' 天');

  if (total === 0) {
    el.weekSummary.textContent = state.habits.length
      ? '本周还没有打卡记录，今天就开始吧 ✨'
      : '先添加想坚持的习惯，打卡后这里会显示本周进度';
  } else {
    el.weekSummary.innerHTML = '本周共完成 <strong>' + total + '</strong> 项 · 坚持了 <strong>' +
      activeDays + '</strong> 天';
  }
}
/* ================= 渲染：清单 ================= */
var lastAddedId = null;

function renderList() {
  el.habitList.textContent = '';
  state.habits.forEach(function (habit, index) {
    var row = buildRow(habit, index);
    if (habit.id === lastAddedId) row.classList.add('row-in');
    el.habitList.appendChild(row);
  });
  var has = state.habits.length > 0;
  el.emptyState.hidden = has;
  el.listTitle.hidden = !has;
  lastAddedId = null;
}

function buildRow(habit, index) {
  var row = document.createElement('li');
  row.className = 'habit-row';
  row.dataset.id = habit.id;
  var doneNow = isDoneToday(habit.id);
  if (doneNow) row.classList.add('done');

  var toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'toggle';
  toggle.setAttribute('aria-pressed', String(doneNow));

  var check = document.createElement('span');
  check.className = 'check';
  check.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.6l4.4 4.4L19 7.4"/></svg>';

  var tile = document.createElement('span');
  tile.className = 'tile';
  tile.style.setProperty('--tint', TINTS[index % TINTS.length]);
  tile.textContent = habit.icon || '⭐';

  var name = document.createElement('span');
  name.className = 'name';
  name.textContent = habit.name;

  toggle.appendChild(check);
  toggle.appendChild(tile);
  toggle.appendChild(name);

  var n = streakOf(habit.id);
  if (n > 0) {
    toggle.appendChild(makeStreak(n));
  }

  var del = document.createElement('button');
  del.type = 'button';
  del.className = 'delete';
  del.title = '删除习惯';
  del.setAttribute('aria-label', '删除习惯：' + habit.name);
  del.textContent = '✕';
  del.addEventListener('click', function (ev) {
    ev.stopPropagation();
    requestDelete(habit.id);
  });

  toggle.addEventListener('click', function () {
    var wasDone = isDoneToday(habit.id);
    toggleToday(habit.id);
    row.classList.toggle('done', !wasDone);
    toggle.setAttribute('aria-pressed', String(!wasDone));
    if (!wasDone) {
      row.classList.add('just-done');
      window.setTimeout(function () { row.classList.remove('just-done'); }, 450);
    }
    refreshStreak(row, habit.id);
    updateHeader();
  });

  row.appendChild(toggle);
  row.appendChild(del);
  return row;
}

function makeStreak(n) {
  var streak = document.createElement('span');
  streak.className = 'streak';
  streak.textContent = '🔥 ' + n + ' 天';
  return streak;
}

function refreshStreak(row, id) {
  var old = row.querySelector('.streak');
  if (old) old.remove();
  var n = streakOf(id);
  if (n > 0) {
    row.querySelector('.toggle').appendChild(makeStreak(n));
  }
}

/* ================= 添加习惯 ================= */
function guessIcon(name) {
  for (var i = 0; i < ICON_RULES.length; i++) {
    if (ICON_RULES[i][0].test(name)) return ICON_RULES[i][1];
  }
  return '⭐';
}

function addHabit(name, icon) {
  name = String(name).trim();
  if (!name) return false;

  var dup = state.habits.some(function (h) { return h.name === name; });
  if (dup) {
    toast('「' + name + '」已经在列表里啦');
    return false;
  }

  var id = 'h' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  state.habits.push({ id: id, name: name, icon: icon || guessIcon(name) });
  lastAddedId = id;
  saveState();
  renderList();
  updateHeader();
  return true;
}

function buildPresets() {
  PRESETS.forEach(function (p) {
    var chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';

    var icon = document.createElement('span');
    icon.className = 'c-icon';
    icon.textContent = p.icon;

    var label = document.createElement('span');
    label.className = 'c-name';
    label.textContent = p.name;

    chip.appendChild(icon);
    chip.appendChild(label);
    chip.addEventListener('click', function () {
      if (addHabit(p.name, p.icon)) toast('已添加「' + p.name + '」');
    });
    el.presets.appendChild(chip);
  });
}

/* ================= 删除 ================= */
var pendingDeleteId = null;

function requestDelete(id) {
  var habit = state.habits.filter(function (h) { return h.id === id; })[0];
  if (!habit) return;
  pendingDeleteId = id;
  el.modalText.textContent = '要删除「' + habit.name + '」吗？这个习惯的历史记录也会一并删除。';
  el.modal.hidden = false;
  el.modalOk.focus();
}

function closeModal() {
  el.modal.hidden = true;
  pendingDeleteId = null;
}

function confirmDelete() {
  var id = pendingDeleteId;
  if (!id) return;
  state.habits = state.habits.filter(function (h) { return h.id !== id; });
  Object.keys(state.completions).forEach(function (key) {
    state.completions[key] = state.completions[key].filter(function (hid) { return hid !== id; });
    if (state.completions[key].length === 0) delete state.completions[key];
  });
  saveState();
  renderList();
  updateHeader();
  closeModal();
  toast('已删除');
}

/* ================= 轻提示 ================= */
var toastTimer = null;

function toast(message) {
  el.toast.textContent = message;
  el.toast.hidden = false;
  el.toast.classList.remove('show');
  void el.toast.offsetWidth; /* 强制回流，重新触发过渡 */
  el.toast.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(function () {
    el.toast.classList.remove('show');
    window.setTimeout(function () { el.toast.hidden = true; }, 300);
  }, 1900);
}

/* ================= 添加面板开关 ================= */
function syncAddUI() {
  var open = !el.addPanel.hidden;
  el.addToggle.innerHTML = open ? '收起' : '<span class="plus" aria-hidden="true">＋</span>添加习惯';
  el.addToggle.setAttribute('aria-expanded', String(open));
}

/* ================= 初始化 ================= */
function init() {
  buildPresets();

  el.addToggle.addEventListener('click', function () {
    el.addPanel.hidden = !el.addPanel.hidden;
    syncAddUI();
    if (!el.addPanel.hidden) el.newHabit.focus();
  });

  el.addForm.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var name = el.newHabit.value.trim();
    if (addHabit(name)) {
      el.newHabit.value = '';
      toast('已添加「' + name + '」');
      el.newHabit.focus();
    }
  });

  el.modalOk.addEventListener('click', confirmDelete);
  el.modalCancel.addEventListener('click', closeModal);
  el.modal.addEventListener('click', function (ev) {
    if (ev.target === el.modal) closeModal();
  });
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && !el.modal.hidden) closeModal();
  });

  renderList();
  updateHeader();
  syncAddUI();
}

init();