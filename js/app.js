import { supabase, isSupabaseConfigured } from "./config.js";

const $ = (selector) => document.querySelector(selector);
const state = {
  user: null, subjects: [], tasks: [], notes: [], authMode: "login", grades: [],
  settings: { full_name: "", course: "", institution: "", min_grade: 60, default_weights: [15, 15, 70], calculation_method: "weighted", category_weights: { Prova: 70, Trabalho: 30 }, custom_formula: "(N1 * 0.2) + (N2 * 0.3) + (N3 * 0.5)", theme: "dark" }
};
let toastTimer;
let timerSeconds = 25 * 60;
let timerRemaining = timerSeconds;
let timerInterval = null;
let timerMode = "Foco";
let timerRunning = false;

function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 3200);
}
function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
}
function dateLabel(value) {
  if (!value) return "Sem prazo definido";
  return new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}
function applyTheme(theme) {
  const selected = theme === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = selected;
  localStorage.setItem("focus-theme", selected);
  const picker = $("#profile-theme");
  if (picker) picker.value = selected;
}
function setAuthMode(mode) {
  state.authMode = mode;
  $("#login-tab").classList.toggle("active", mode === "login");
  $("#signup-tab").classList.toggle("active", mode === "signup");
  $("#auth-submit").textContent = mode === "login" ? "Entrar na plataforma" : "Criar minha conta";
  $("#auth-password").autocomplete = mode === "login" ? "current-password" : "new-password";
  $("#auth-feedback").textContent = "";
}
function loadUserSettings(user) {
  const metadata = user.user_metadata || {};
  state.settings = {
    full_name: metadata.full_name || "",
    course: metadata.course || "",
    institution: metadata.institution || "",
    min_grade: Number.isFinite(Number(metadata.min_grade)) ? Number(metadata.min_grade) : 60,
    default_weights: Array.isArray(metadata.default_weights) && metadata.default_weights.length
      ? metadata.default_weights.map(Number).filter(n => Number.isFinite(n) && n > 0)
      : [15, 15, 70],
    calculation_method: ["weighted", "arithmetic", "sum", "category", "custom"].includes(metadata.calculation_method) ? metadata.calculation_method : "weighted",
    category_weights: metadata.category_weights && typeof metadata.category_weights === "object" ? metadata.category_weights : { Prova: 70, Trabalho: 30 },
    custom_formula: typeof metadata.custom_formula === "string" ? metadata.custom_formula : "(N1 * 0.2) + (N2 * 0.3) + (N3 * 0.5)",
    grading_notes: typeof metadata.grading_notes === "string" ? metadata.grading_notes : "",
    theme: metadata.theme === "light" ? "light" : (localStorage.getItem("focus-theme") || "dark")
  };
  applyTheme(state.settings.theme);
}
function showApp(user) {
  state.user = user;
  loadUserSettings(user);
  $("#auth-screen").classList.add("hidden");
  $("#app-screen").classList.remove("hidden");
  const displayName = state.settings.full_name || user.email || "Estudante";
  $("#user-email").textContent = displayName;
  $("#user-avatar").textContent = displayName.charAt(0).toUpperCase();
  loadAll();
}
function showAuth() {
  state.user = null;
  state.subjects = []; state.tasks = []; state.notes = []; state.grades = [];
  $("#app-screen").classList.add("hidden");
  $("#auth-screen").classList.remove("hidden");
}
function showView(view) {
  document.querySelectorAll(".view").forEach(el => el.classList.add("hidden"));
  $(`#view-${view}`)?.classList.remove("hidden");
  document.querySelectorAll(".nav-link").forEach(el => el.classList.toggle("active", el.dataset.view === view));
}
function requireSupabase() {
  if (!isSupabaseConfigured) {
    $("#auth-feedback").textContent = "Configure a URL e a chave publicável em js/config.js antes de usar.";
    return false;
  }
  return true;
}

$("#login-tab").addEventListener("click", () => setAuthMode("login"));
$("#signup-tab").addEventListener("click", () => setAuthMode("signup"));
$("#auth-form").addEventListener("submit", async event => {
  event.preventDefault();
  if (!requireSupabase()) return;
  const email = $("#auth-email").value.trim();
  const password = $("#auth-password").value;
  const button = $("#auth-submit");
  button.disabled = true;
  $("#auth-feedback").textContent = "Aguarde...";
  try {
    if (state.authMode === "signup") {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
      if (data.session) toast("Conta criada com sucesso!");
      else $("#auth-feedback").textContent = "Cadastro iniciado! Confira seu e-mail para confirmar a conta e depois faça login.";
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    }
  } catch (error) {
    $("#auth-feedback").textContent = readableError(error);
  } finally { button.disabled = false; }
});
function readableError(error) {
  const message = error?.message || "Não foi possível concluir a operação.";
  if (/invalid login credentials/i.test(message)) return "E-mail ou senha incorretos.";
  if (/email not confirmed/i.test(message)) return "Confirme seu e-mail antes de entrar.";
  if (/email rate limit exceeded|over_email_send_rate_limit|rate limit.*email|email.*rate limit/i.test(message)) return "O limite de envio de e-mails do provedor atual foi atingido. Configure um SMTP próprio no Supabase seguindo smtp/README.md e tente novamente após o intervalo de bloqueio.";
  if (/failed to fetch|networkerror/i.test(message)) return "Falha de conexão. Confira sua internet e a configuração do Supabase.";
  return message;
}
$("#logout-button").addEventListener("click", async () => {
  const { error } = await supabase.auth.signOut();
  if (error) toast(error.message);
});
document.querySelectorAll("[data-view]").forEach(button => button.addEventListener("click", () => showView(button.dataset.view)));
document.querySelectorAll('[data-action="new-task"]').forEach(button => button.addEventListener("click", () => { showView("tasks"); $("#task-title").focus(); }));

async function loadAll() {
  if (!state.user || !supabase) return;
  try {
    const [subjectsResult, tasksResult, notesResult] = await Promise.all([
      supabase.from("subjects").select("*").order("created_at", { ascending: false }),
      supabase.from("tasks").select("*").order("due_date", { ascending: true, nullsFirst: false }),
      supabase.from("notes").select("*").order("created_at", { ascending: false })
    ]);
    for (const result of [subjectsResult, tasksResult, notesResult]) if (result.error) throw result.error;
    state.subjects = subjectsResult.data || [];
    state.tasks = tasksResult.data || [];
    state.notes = notesResult.data || [];
    renderAll();
    await Promise.all([loadEvents(), loadFocusHistory(), loadGrades(), loadReports()]);
    renderProfile();
  } catch (error) { toast(`Erro ao carregar dados: ${readableError(error)}`); }
}
function renderAll() {
  renderStats(); renderSubjectOptions(); renderSubjects(); renderTasks(); renderDashboard(); renderNotes();
}
function renderStats() {
  const done = state.tasks.filter(task => task.status === "Concluída").length;
  const open = state.tasks.length - done;
  const progress = state.tasks.length ? Math.round(done / state.tasks.length * 100) : 0;
  $("#stat-subjects").textContent = state.subjects.length;
  $("#stat-open").textContent = open;
  $("#stat-done").textContent = done;
  $("#stat-progress").textContent = `${progress}%`;
  $("#subject-total-label").textContent = `${state.subjects.length} ${state.subjects.length === 1 ? "matéria" : "matérias"}`;
}
function renderSubjectOptions() {
  const options = state.subjects.map(subject => `<option value="${subject.id}">${escapeHTML(subject.name)}</option>`).join("");
  $("#task-subject").innerHTML = `<option value="">Sem matéria vinculada</option>${options}`;
  $("#note-subject").innerHTML = `<option value="">Sem matéria vinculada</option>${options}`;
  const ms = $("#method-subject"), prev = ms.value;
  ms.innerHTML = `<option value="">Todas as matérias (regra geral)</option>${options}`;
  if (state.subjects.some(s => s.id === prev)) ms.value = prev;
  syncMethodNotes();
  renderGradeOptions();
}
function syncMethodNotes() {
  const id = $("#method-subject").value;
  $("#method-notes").value = id ? (state.subjects.find(s => s.id === id)?.grading_notes || "") : (state.settings.grading_notes || "");
}
function methodNote(key) { return (state.subjects.find(s => s.id === key)?.grading_notes || state.settings.grading_notes || "").trim(); }
$("#method-subject").addEventListener("change", syncMethodNotes);
function subjectName(id) { return state.subjects.find(subject => subject.id === id)?.name || "Sem matéria"; }
function renderSubjects() {
  const container = $("#subjects-list");
  if (!state.subjects.length) {
    container.innerHTML = '<div class="empty-state">Você ainda não cadastrou matérias. Comece adicionando sua primeira disciplina.</div>';
    $("#dashboard-subjects").innerHTML = '<div class="empty-state">Suas matérias aparecerão aqui.</div>';
    return;
  }
  container.innerHTML = state.subjects.map(subject => `<article class="subject-card"><div><h3>${escapeHTML(subject.name)}</h3><p>${escapeHTML(subject.description || "Sem descrição")}</p></div><button class="icon-button" data-delete-subject="${subject.id}" title="Excluir matéria">Excluir</button></article>`).join("");
  $("#dashboard-subjects").innerHTML = state.subjects.slice(0, 5).map(subject => `<div class="subject-row"><span class="subject-dot"></span><div><strong>${escapeHTML(subject.name)}</strong><small>${escapeHTML(subject.description || "Disciplina cadastrada")}</small></div></div>`).join("");
}
function taskMarkup(task, compact = false) {
  const statusClass = task.status === "Concluída" ? "done" : task.status === "Em andamento" ? "progress" : "";
  const priorityClass = task.priority === "Alta" ? "high" : "";
  return `<article class="task-row"><div class="task-main"><strong>${escapeHTML(task.title)}</strong><small>${escapeHTML(subjectName(task.subject_id))} · ${dateLabel(task.due_date)}</small></div><span class="status-pill ${statusClass}">${escapeHTML(task.status)}</span>${!compact && task.priority ? `<span class="priority-pill ${priorityClass}">${escapeHTML(task.priority)}</span>` : ""}${!compact ? `<div class="row-actions"><button class="mini-button" data-edit-task="${task.id}">Editar</button><button class="mini-button" data-delete-task="${task.id}">Excluir</button></div>` : ""}</article>`;
}
function renderTasks() {
  const filter = $("#task-filter").value;
  const tasks = filter === "Todas" ? state.tasks : state.tasks.filter(task => task.status === filter);
  $("#tasks-list").innerHTML = tasks.length ? tasks.map(task => taskMarkup(task)).join("") : '<div class="empty-state">Nenhuma atividade nesta categoria.</div>';
}
function renderDashboard() {
  const upcoming = state.tasks.filter(task => task.status !== "Concluída").slice(0, 5);
  $("#dashboard-tasks").innerHTML = upcoming.length ? upcoming.map(task => taskMarkup(task, true)).join("") : '<div class="empty-state">Tudo em dia por aqui. Cadastre uma atividade para começar.</div>';
  $("#today-label").textContent = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" }).toUpperCase();
}
function renderNotes() {
  $("#notes-list").innerHTML = state.notes.length ? state.notes.map(note => `<article class="note-card"><h3>${escapeHTML(note.title)}</h3><p>${escapeHTML(note.content)}</p><div class="note-meta"><span>${escapeHTML(subjectName(note.subject_id))}</span><button class="mini-button" data-delete-note="${note.id}">Excluir</button></div></article>`).join("") : '<div class="empty-state">Nenhuma anotação salva ainda.</div>';
}

$("#subject-form").addEventListener("submit", async event => {
  event.preventDefault();
  const name = $("#subject-name").value.trim();
  const description = $("#subject-description").value.trim();
  if (!name || !state.user) return;
  const { error } = await supabase.from("subjects").insert({ name, description, user_id: state.user.id });
  if (error) return toast(error.message);
  $("#subject-form").reset(); toast("Matéria adicionada!"); await loadAll();
});
$("#task-form").addEventListener("submit", async event => {
  event.preventDefault();
  const title = $("#task-title").value.trim();
  if (!title || !state.user) return;
  const payload = { title, description: $("#task-description").value.trim(), subject_id: $("#task-subject").value || null, due_date: $("#task-date").value || null, priority: $("#task-priority").value, status: "Pendente", user_id: state.user.id };
  const { error } = await supabase.from("tasks").insert(payload);
  if (error) return toast(error.message);
  $("#task-form").reset(); toast("Atividade cadastrada!"); await loadAll();
});
$("#note-form").addEventListener("submit", async event => {
  event.preventDefault();
  const title = $("#note-title").value.trim(); const content = $("#note-content").value.trim();
  if (!title || !content || !state.user) return;
  const { error } = await supabase.from("notes").insert({ title, content, subject_id: $("#note-subject").value || null, user_id: state.user.id });
  if (error) return toast(error.message);
  $("#note-form").reset(); toast("Anotação salva!"); await loadAll();
});
$("#task-filter").addEventListener("change", renderTasks);

document.addEventListener("click", async event => {
  const deleteSubject = event.target.closest("[data-delete-subject]");
  const deleteTask = event.target.closest("[data-delete-task]");
  const editTask = event.target.closest("[data-edit-task]");
  const deleteNote = event.target.closest("[data-delete-note]");
  const deleteEvent = event.target.closest("[data-delete-event]");
  const deleteGrade = event.target.closest("[data-delete-grade]");
  if (deleteSubject) {
    const subject = state.subjects.find(item => item.id === deleteSubject.dataset.deleteSubject);
    if (!confirm(`Excluir a matéria "${subject?.name}"? As atividades vinculadas ficarão sem matéria.`)) return;
    const { error } = await supabase.from("subjects").delete().eq("id", deleteSubject.dataset.deleteSubject);
    if (error) return toast(error.message); toast("Matéria excluída."); await loadAll();
  }
  if (deleteTask) {
    if (!confirm("Deseja excluir esta atividade?")) return;
    const { error } = await supabase.from("tasks").delete().eq("id", deleteTask.dataset.deleteTask);
    if (error) return toast(error.message); toast("Atividade excluída."); await loadAll();
  }
  if (editTask) {
    const task = state.tasks.find(item => item.id === editTask.dataset.editTask);
    if (!task) return;
    $("#edit-task-id").value = task.id; $("#edit-task-title").value = task.title;
    $("#edit-task-status").value = task.status; $("#edit-task-date").value = task.due_date || "";
    $("#edit-task-dialog").showModal();
  }
  if (deleteNote) {
    if (!confirm("Deseja excluir esta anotação?")) return;
    const { error } = await supabase.from("notes").delete().eq("id", deleteNote.dataset.deleteNote);
    if (error) return toast(error.message); toast("Anotação excluída."); await loadAll();
  }
  if (deleteEvent) {
    if (!confirm("Excluir este evento?")) return;
    const { error } = await supabase.from("events").delete().eq("id", deleteEvent.dataset.deleteEvent);
    if (error) return toast(error.message); toast("Evento excluído."); await loadEvents();
  }
  if (deleteGrade) {
    if (!confirm("Excluir esta avaliação?")) return;
    const { error } = await supabase.from("grades").delete().eq("id", deleteGrade.dataset.deleteGrade);
    if (error) return toast(error.message); toast("Avaliação excluída."); await loadGrades();
  }
});
function closeDialog() { $("#edit-task-dialog").close(); }
$("#close-dialog").addEventListener("click", closeDialog);
$("#cancel-dialog").addEventListener("click", closeDialog);
$("#edit-task-form").addEventListener("submit", async event => {
  event.preventDefault();
  const { error } = await supabase.from("tasks").update({ title: $("#edit-task-title").value.trim(), status: $("#edit-task-status").value, due_date: $("#edit-task-date").value || null }).eq("id", $("#edit-task-id").value);
  if (error) return toast(error.message); closeDialog(); toast("Atividade atualizada!"); await loadAll();
});

// Calendário acadêmico, importação .ics e lembretes
let eventsCache = [];
let icsItems = [];
const localToday = () => new Date().toLocaleDateString("sv-SE");
function daysUntil(dateStr) { const t = new Date(); t.setHours(0, 0, 0, 0); return Math.round((new Date(`${dateStr}T00:00:00`) - t) / 86400000); }
async function loadEvents() {
  if (!state.user) return;
  const { data, error } = await supabase.from("events").select("*").order("event_date", { ascending: true });
  if (error) return toast(error.message);
  eventsCache = data || [];
  $("#events-list").innerHTML = eventsCache.length ? eventsCache.map(item => `<article class="task-row"><div class="task-main"><strong>${escapeHTML(item.title)}</strong><small>${dateLabel(item.event_date)} · ${escapeHTML(item.event_type)} · lembrete ${item.remind_days_before ?? 1}d antes</small></div><button class="mini-button" data-delete-event="${item.id}">Excluir</button></article>`).join("") : '<div class="empty-state">Nenhum evento cadastrado.</div>';
  renderReminders();
}
function renderReminders() {
  const due = [];
  eventsCache.forEach(e => { const d = daysUntil(e.event_date); if (d >= 0 && d <= (e.remind_days_before ?? 1)) due.push({ title: e.title, type: e.event_type, d }); });
  state.tasks.forEach(t => { if (t.status !== "Concluída" && t.due_date) { const d = daysUntil(t.due_date); if (d >= 0 && d <= 1) due.push({ title: t.title, type: "Atividade", d }); } });
  due.sort((a, b) => a.d - b.d);
  const label = d => d === 0 ? "hoje" : d === 1 ? "amanhã" : `em ${d} dias`;
  $("#reminder-box").innerHTML = due.length ? `<div class="reminder-banner"><strong>🔔 Lembretes</strong>${due.map(i => `<div>${escapeHTML(i.type)}: <b>${escapeHTML(i.title)}</b> — ${label(i.d)}</div>`).join("")}</div>` : "";
  if ("Notification" in window && Notification.permission === "granted") {
    const key = `focus-notified-${localToday()}`;
    const done = JSON.parse(localStorage.getItem(key) || "[]");
    due.forEach(i => { const id = `${i.type}|${i.title}|${i.d}`; if (!done.includes(id)) { new Notification(`${i.type}: ${i.title}`, { body: `Acontece ${label(i.d)}.` }); done.push(id); } });
    localStorage.setItem(key, JSON.stringify(done));
  }
}
$("#event-form").addEventListener("submit", async event => {
  event.preventDefault();
  if (!state.user) return;
  const payload = { title: $("#event-title").value.trim(), event_date: $("#event-date").value, event_type: $("#event-type").value, remind_days_before: Number($("#event-remind").value), user_id: state.user.id };
  const { error } = await supabase.from("events").insert(payload);
  if (error) return toast(error.message); $("#event-form").reset(); toast("Evento adicionado!"); await loadEvents();
});
function guessEventType(text) {
  const s = text.toLowerCase();
  if (/simulado/.test(s)) return "Simulado";
  if (/prova|avalia|\bav\d|exame|\bp[1-4]\b/.test(s)) return "Prova";
  if (/trabalho|entrega|atividade|semin[aá]rio|projeto/.test(s)) return "Trabalho";
  if (/aula/.test(s)) return "Aula";
  return "Compromisso";
}
function parseICS(text) {
  const lines = text.replace(/\r/g, "").replace(/\n[ \t]/g, "").split("\n");
  const out = []; let cur = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") { cur = {}; continue; }
    if (line === "END:VEVENT") { if (cur && cur.date && cur.title) out.push({ ...cur, type: guessEventType(cur.title) }); cur = null; continue; }
    if (!cur) continue;
    const i = line.indexOf(":"); if (i < 0) continue;
    const key = line.slice(0, i).split(";")[0].toUpperCase(), val = line.slice(i + 1);
    if (key === "SUMMARY") cur.title = val.replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\n/gi, " ").trim();
    else if (key === "DTSTART") { const m = val.match(/^(\d{4})(\d{2})(\d{2})/); if (m) cur.date = `${m[1]}-${m[2]}-${m[3]}`; }
  }
  return out;
}
function renderIcsPreview() {
  const type = $("#ics-filter-type").value, future = $("#ics-future").checked, today = localToday();
  const shown = icsItems.map((e, i) => ({ ...e, i })).filter(e => (!type || e.type === type) && (!future || e.date >= today));
  $("#ics-preview").innerHTML = shown.length ? shown.slice(0, 300).map(e => `<label class="task-row"><input type="checkbox" data-ics="${e.i}" checked><div class="task-main"><strong>${escapeHTML(e.title)}</strong><small>${dateLabel(e.date)} · ${e.type}</small></div></label>`).join("") : '<div class="empty-state">Nenhum evento para mostrar com esses filtros.</div>';
  $("#ics-import").classList.toggle("hidden", !shown.length);
}
$("#ics-file").addEventListener("change", async event => {
  const file = event.target.files[0]; if (!file) return;
  icsItems = parseICS(await file.text());
  if (!icsItems.length) toast("Não encontrei eventos nesse arquivo.");
  renderIcsPreview();
});
$("#ics-filter-type").addEventListener("change", renderIcsPreview);
$("#ics-future").addEventListener("change", renderIcsPreview);
$("#ics-import").addEventListener("click", async () => {
  const picks = [...document.querySelectorAll("[data-ics]:checked")].map(c => icsItems[Number(c.dataset.ics)]);
  if (!picks.length) return toast("Selecione ao menos um evento.");
  const existing = new Set(eventsCache.map(e => `${e.title}|${e.event_date}`));
  const rows = picks.filter(e => !existing.has(`${e.title}|${e.date}`)).map(e => ({ user_id: state.user.id, title: e.title.slice(0, 120), event_date: e.date, event_type: e.type, remind_days_before: Number($("#ics-remind").value) }));
  if (!rows.length) return toast("Esses eventos já estão no seu calendário.");
  const { error } = await supabase.from("events").insert(rows);
  if (error) return toast(error.message);
  toast(`${rows.length} eventos importados!`); icsItems = []; $("#ics-preview").innerHTML = ""; $("#ics-import").classList.add("hidden"); $("#ics-file").value = ""; await loadEvents();
});
$("#notify-enable").addEventListener("click", async () => {
  if (!("Notification" in window)) return toast("Seu navegador não suporta notificações.");
  const result = await Notification.requestPermission();
  toast(result === "granted" ? "Notificações ativadas!" : "Permissão negada."); renderReminders();
});

// Mini resumo automático (genérico, via Wikipédia)
$("#note-autosummary").addEventListener("click", async () => {
  const topic = ($("#note-topic").value || $("#note-title").value).trim();
  if (!topic) return toast("Digite um tema para gerar o mini resumo.");
  const button = $("#note-autosummary"); button.disabled = true; button.textContent = "Buscando...";
  try {
    const search = await (await fetch(`https://pt.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(topic)}&srlimit=1&format=json&origin=*`)).json();
    const title = search?.query?.search?.[0]?.title;
    if (!title) throw new Error("Não encontrei material sobre esse tema.");
    const page = await (await fetch(`https://pt.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`)).json();
    if (!page.extract) throw new Error("Sem resumo disponível para esse tema.");
    $("#note-content").value = `MINI RESUMO (genérico) — ${page.title}\n\n${page.extract}\n\n⚠️ Este é um resumo genérico, automático e curto, baseado na Wikipédia. Ele não cobre o assunto completo e não segue o enfoque dos seus professores. Complete com o conteúdo das suas aulas.\nFonte: ${page.content_urls?.desktop?.page || "Wikipédia"}`;
    if (!$("#note-title").value.trim()) $("#note-title").value = `Resumo: ${page.title}`;
  } catch (error) { toast(error.message || "Falha ao buscar o resumo."); }
  finally { button.disabled = false; button.textContent = "✨ Gerar mini resumo"; }
});

// Pomodoro
function renderTimer() {
  const minutes = Math.floor(timerRemaining / 60).toString().padStart(2, "0");
  const seconds = (timerRemaining % 60).toString().padStart(2, "0");
  $("#pomodoro-clock").textContent = `${minutes}:${seconds}`;
  $("#timer-start").textContent = timerRunning ? "Pausar" : "Iniciar foco";
}
function stopTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = null; timerRunning = false; renderTimer();
}
function selectTimerMode(button) {
  stopTimer(); timerMode = button.dataset.mode; timerSeconds = Number(button.dataset.minutes) * 60; timerRemaining = timerSeconds;
  document.querySelectorAll(".mode-button").forEach(item => item.classList.toggle("active", item === button));
  $("#pomodoro-label").textContent = timerMode === "Foco" ? "Hora de concentrar." : "Descanse um pouco."; renderTimer();
}
document.querySelectorAll(".mode-button").forEach(button => button.addEventListener("click", () => selectTimerMode(button)));
$("#timer-start").addEventListener("click", () => {
  if (!state.user) return toast("Entre na sua conta para registrar sessões.");
  if (timerRunning) { stopTimer(); return; }
  timerRunning = true; renderTimer();
  timerInterval = setInterval(async () => {
    timerRemaining -= 1; renderTimer();
    if (timerRemaining <= 0) {
      stopTimer();
      if (timerMode === "Foco") {
        const { error } = await supabase.from("focus_sessions").insert({ user_id: state.user.id, mode: timerMode, duration_minutes: Math.round(timerSeconds / 60) });
        if (error) toast(`Sessão terminou, mas não foi salva: ${error.message}`);
        else { toast("Sessão de foco concluída!"); await loadFocusHistory(); await loadReports(); }
      } else toast("Pausa concluída. Você pode voltar ao foco!");
      $("#pomodoro-label").textContent = "Ciclo finalizado. Escolha o próximo passo.";
    }
  }, 1000);
});
$("#timer-reset").addEventListener("click", () => { stopTimer(); timerRemaining = timerSeconds; renderTimer(); });
async function loadFocusHistory() {
  if (!state.user) return;
  const { data, error } = await supabase.from("focus_sessions").select("*").order("completed_at", { ascending: false }).limit(20);
  if (error) return toast(error.message);
  const sessions = data || [];
  $("#focus-history").innerHTML = sessions.length ? sessions.map(item => `<article class="task-row"><div class="task-main"><strong>${escapeHTML(item.mode)} · ${item.duration_minutes} minutos</strong><small>${new Date(item.completed_at).toLocaleString("pt-BR")}</small></div><span class="status-pill done">Concluída</span></article>`).join("") : '<div class="empty-state">Suas sessões concluídas aparecerão aqui.</div>';
}

// Notas: métodos configuráveis por perfil, sem executar código arbitrário.
function renderGradeOptions() {
  const select = $("#grade-subject");
  if (!select) return;
  const previous = select.value;
  select.innerHTML = '<option value="">Selecione uma matéria</option>' + state.subjects.map(subject => `<option value="${subject.id}">${escapeHTML(subject.name)}</option>`).join("");
  if (state.subjects.some(subject => subject.id === previous)) select.value = previous;
  updateSuggestedWeight();
}
function updateSuggestedWeight() {
  const subjectId = $("#grade-subject").value;
  const count = state.grades.filter(item => (item.subject_id || "") === subjectId).length;
  const weights = state.settings.default_weights.length ? state.settings.default_weights : [15, 15, 70];
  $("#grade-weight").value = weights[Math.min(count, weights.length - 1)] ?? 15;
}
$("#grade-subject").addEventListener("change", updateSuggestedWeight);
async function loadGrades() {
  if (!state.user) return;
  const { data, error } = await supabase.from("grades").select("*").order("created_at", { ascending: true });
  if (error) return toast(error.message);
  state.grades = data || [];
  renderGrades(); updateSuggestedWeight();
}
function parseCategoryWeights(raw) {
  const result = {};
  for (const part of String(raw || "").split(",")) {
    const match = part.trim().match(/^(.+?)\s*:\s*(\d+(?:\.\d+)?)$/);
    if (!match) continue;
    result[match[1].trim()] = Number(match[2]);
  }
  return result;
}
function calculateCustomFormula(formula, grades) {
  const tokens = String(formula || "").match(/N\d+|\d+(?:\.\d+)?|[()+\-*/]/gi) || [];
  const compact = String(formula || "").replace(/\s+/g, "");
  if (!compact || tokens.join("").toLowerCase() !== compact.toLowerCase()) throw new Error("A fórmula contém caracteres não permitidos.");
  let index = 0;
  function expression() {
    let value = term();
    while (tokens[index] === "+" || tokens[index] === "-") {
      const op = tokens[index++], right = term();
      value = op === "+" ? value + right : value - right;
    }
    return value;
  }
  function term() {
    let value = factor();
    while (tokens[index] === "*" || tokens[index] === "/") {
      const op = tokens[index++], right = factor();
      if (op === "/" && right === 0) throw new Error("A fórmula não pode dividir por zero.");
      value = op === "*" ? value * right : value / right;
    }
    return value;
  }
  function factor() {
    const token = tokens[index++];
    if (token === "+") return factor();
    if (token === "-") return -factor();
    if (token === "(") {
      const value = expression();
      if (tokens[index++] !== ")") throw new Error("Confira os parênteses da fórmula.");
      return value;
    }
    if (!token) throw new Error("Fórmula incompleta.");
    if (/^N\d+$/i.test(token)) {
      const number = Number(token.slice(1));
      if (number < 1 || number > grades.length) throw new Error(`${token} não corresponde a uma avaliação cadastrada.`);
      return Number(grades[number - 1].grade);
    }
    const value = Number(token);
    if (!Number.isFinite(value)) throw new Error("Número inválido na fórmula.");
    return value;
  }
  const result = expression();
  if (index !== tokens.length || !Number.isFinite(result)) throw new Error("Não foi possível calcular a fórmula. Verifique a expressão.");
  return result;
}
function calculateGradeGroup(items) {
  const method = state.settings.calculation_method || "weighted";
  if (method === "sum") return items.reduce((sum, item) => sum + Number(item.grade), 0);
  if (method === "arithmetic") return items.reduce((sum, item) => sum + Number(item.grade), 0) / items.length;
  if (method === "custom") return calculateCustomFormula(state.settings.custom_formula, items);
  if (method === "category") {
    const weights = state.settings.category_weights || {};
    const totalConfigured = Object.values(weights).reduce((sum, value) => sum + Number(value), 0);
    if (!Object.keys(weights).length || Math.abs(totalConfigured - 100) > 0.001) throw new Error("Configure no Perfil os pesos por categoria somando 100%.");
    let total = 0, appliedWeight = 0;
    for (const [category, weight] of Object.entries(weights)) {
      const categoryItems = items.filter(item => (item.category || "Geral").toLowerCase() === category.toLowerCase());
      if (!categoryItems.length) continue;
      const average = categoryItems.reduce((sum, item) => sum + Number(item.grade), 0) / categoryItems.length;
      total += average * Number(weight);
      appliedWeight += Number(weight);
    }
    return appliedWeight ? total / appliedWeight : 0;
  }
  const totalWeight = items.reduce((sum, item) => sum + Number(item.weight ?? 15), 0);
  return totalWeight ? items.reduce((sum, item) => sum + Number(item.grade) * Number(item.weight ?? 15), 0) / totalWeight : 0;
}
function renderGrades() {
  const groups = new Map();
  state.grades.forEach(item => {
    const key = item.subject_id || "none";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  });
  const methodNames = { weighted: "Média ponderada", arithmetic: "Média aritmética", sum: "Soma de pontos", category: "Pesos por categoria", custom: "Fórmula personalizada" };
  $("#grade-method-hint").textContent = `Método atual: ${methodNames[state.settings.calculation_method] || methodNames.weighted}. Altere em Perfil > Método de cálculo das notas.`;
  $("#grades-list").innerHTML = groups.size ? [...groups.entries()].map(([key, items]) => {
    let result = 0, calculationError = "";
    try { result = calculateGradeGroup(items); } catch (error) { calculationError = error.message; }
    const passed = result >= Number(state.settings.min_grade || 60);
    const totalWeight = items.reduce((sum, item) => sum + Number(item.weight ?? 15), 0);
    const weightLabel = Math.min(totalWeight, 100).toFixed(0);
    const details = items.map(item => `${escapeHTML(item.title)}: ${Number(item.grade).toFixed(2)} (${escapeHTML(item.category || "Geral")})`).join(" · ");
    const resultLabel = state.settings.calculation_method === "sum" ? `${result.toFixed(2)} pontos` : `${result.toFixed(2)} / 100`;
    return `<article class="grade-card"><div class="grade-card-top"><div class="task-main"><strong>${escapeHTML(key === "none" ? "Sem matéria vinculada" : subjectName(key))}</strong><small>${details}</small><small class="weight-coverage">${methodNames[state.settings.calculation_method] || methodNames.weighted}</small>${methodNote(key) ? `<small class="field-hint">Regra da faculdade: ${escapeHTML(methodNote(key))}</small>` : ""}${calculationError ? `<small class="field-hint">${escapeHTML(calculationError)}</small>` : ""}</div><div class="grade-average"><strong>${calculationError ? "—" : result.toFixed(2)}</strong><span>${state.settings.calculation_method === "sum" ? "pontos" : "/ 100"}</span><em class="status-pill ${!calculationError && passed ? "done" : "progress"}">${!calculationError && passed ? "Atingiu a média" : "Em acompanhamento"}</em></div></div><div class="grade-items">${items.map(item => `<div class="grade-item"><span>${escapeHTML(item.title)} · ${Number(item.grade).toFixed(2)} pontos · ${escapeHTML(item.category || "Geral")}</span><button class="mini-button" data-delete-grade="${item.id}" aria-label="Excluir avaliação">Excluir</button></div>`).join("")}</div></article>`;
  }).join("") : '<div class="empty-state">Cadastre uma avaliação para acompanhar seus resultados.</div>';
}
$("#grade-form").addEventListener("submit", async event => {
  event.preventDefault();
  if (!state.user) return;
  const subject_id = $("#grade-subject").value || null;
  const title = $("#grade-title").value.trim();
  const category = $("#grade-category").value.trim() || "Geral";
  const grade = Number($("#grade-value").value);
  const weight = Number($("#grade-weight").value);
  if (!title || !Number.isFinite(grade) || grade < 0 || grade > 100) return toast("Informe uma nota entre 0 e 100.");
  if (!Number.isFinite(weight) || weight <= 0 || weight > 100) return toast("O peso deve ser maior que 0 e no máximo 100%.");
  const currentWeight = state.grades.filter(item => (item.subject_id || null) === subject_id).reduce((sum, item) => sum + Number(item.weight ?? 15), 0);
  if ((state.settings.calculation_method || "weighted") === "weighted" && currentWeight + weight > 100) return toast(`Os pesos desta matéria já somam ${currentWeight}%. O total não pode passar de 100%.`);
  const { error } = await supabase.from("grades").insert({ user_id: state.user.id, subject_id, title, category, grade, weight });
  if (error) return toast(error.message);
  $("#grade-form").reset(); toast("Avaliação registrada!"); await loadGrades();
});

// Relatórios
async function loadReports() {
  if (!state.user) return;
  const { data, error } = await supabase.from("focus_sessions").select("duration_minutes");
  if (error) return toast(error.message);
  const sessions = data || [];
  const minutes = sessions.reduce((sum, item) => sum + Number(item.duration_minutes), 0);
  const done = state.tasks.filter(task => task.status === "Concluída").length;
  const percent = state.tasks.length ? Math.round(done / state.tasks.length * 100) : 0;
  $("#report-hours").textContent = `${(minutes / 60).toFixed(1)}h`;
  $("#report-sessions").textContent = sessions.length;
  $("#report-tasks").textContent = done;
  $("#report-notes").textContent = state.notes.length;
  $("#report-progress-bar").style.width = `${percent}%`;
  $("#report-progress-label").textContent = `${percent}% das atividades concluídas (${done} de ${state.tasks.length}).`;
}

// Perfil e preferências
function renderProfile() {
  const metadata = state.user?.user_metadata || {};
  $("#profile-email").textContent = state.user?.email || "Estudante";
  $("#profile-avatar").textContent = (state.settings.full_name || state.user?.email || "F").charAt(0).toUpperCase();
  $("#profile-name").value = state.settings.full_name;
  $("#profile-course").value = state.settings.course;
  $("#profile-institution").value = state.settings.institution;
  $("#profile-min-grade").value = state.settings.min_grade;
  $("#profile-default-weights").value = state.settings.default_weights.join(", ");
  $("#profile-calculation-method").value = state.settings.calculation_method || "weighted";
  $("#profile-category-weights").value = Object.entries(state.settings.category_weights || {}).map(([name, weight]) => `${name}: ${weight}`).join(", ");
  $("#profile-custom-formula").value = state.settings.custom_formula || "";
  $("#profile-theme").value = state.settings.theme;
  $("#profile-created").textContent = state.user?.created_at ? new Date(state.user.created_at).toLocaleDateString("pt-BR") : "—";
  if (metadata.full_name) $("#user-email").textContent = metadata.full_name;
  syncMethodNotes();
}
async function saveSettings(event) {
  event.preventDefault();
  if (!state.user) return;
  const weights = $("#profile-default-weights").value.split(/[;,\s]+/).filter(Boolean).map(Number);
  const minGrade = Number($("#profile-min-grade").value);
  if (!weights.length || weights.some(value => !Number.isFinite(value) || value <= 0 || value > 100) || Math.abs(weights.reduce((a, b) => a + b, 0) - 100) > 0.001) {
    return toast("Os pesos padrão precisam ser números positivos e somar exatamente 100. Exemplo: 15, 15, 70.");
  }
  if (!Number.isFinite(minGrade) || minGrade < 0 || minGrade > 100) return toast("A nota mínima deve ficar entre 0 e 100.");
  const theme = $("#profile-theme").value;
  const calculation_method = $("#profile-calculation-method").value;
  const category_weights = parseCategoryWeights($("#profile-category-weights").value);
  const custom_formula = $("#profile-custom-formula").value.trim();
  if (calculation_method === "category") {
    const categoryTotal = Object.values(category_weights).reduce((sum, value) => sum + value, 0);
    if (!Object.keys(category_weights).length || Object.values(category_weights).some(value => !Number.isFinite(value) || value <= 0 || value > 100) || Math.abs(categoryTotal - 100) > 0.001) return toast("Os pesos por categoria precisam ser positivos e somar 100%. Exemplo: Prova: 70, Trabalho: 30.");
  }
  if (calculation_method === "custom" && !custom_formula) return toast("Informe a fórmula personalizada usando N1, N2, N3... .");
  const methodSubjectId = $("#method-subject").value, methodNotes = $("#method-notes").value.trim();
  const metadata = {
    grading_notes: methodSubjectId ? (state.settings.grading_notes || "") : methodNotes,
    full_name: $("#profile-name").value.trim(), course: $("#profile-course").value.trim(),
    institution: $("#profile-institution").value.trim(), min_grade: minGrade, default_weights: weights,
    calculation_method, category_weights, custom_formula, theme
  };
  const { data, error } = await supabase.auth.updateUser({ data: metadata });
  if (error) return toast(error.message);
  if (methodSubjectId) {
    const r = await supabase.from("subjects").update({ grading_notes: methodNotes }).eq("id", methodSubjectId);
    if (r.error) return toast(r.error.message.includes("grading_notes") ? "Execute o supabase.sql atualizado para salvar a regra por matéria." : r.error.message);
    const s = state.subjects.find(x => x.id === methodSubjectId); if (s) s.grading_notes = methodNotes;
  }
  state.user = data.user; state.settings = { ...metadata }; applyTheme(theme); renderProfile();
  $("#user-email").textContent = metadata.full_name || state.user.email;
  $("#user-avatar").textContent = (metadata.full_name || state.user.email || "F").charAt(0).toUpperCase();
  renderGrades(); toast("Configurações salvas!");
}
$("#profile-form").addEventListener("submit", saveSettings);
$("#method-form").addEventListener("submit", saveSettings);
$("#profile-theme").addEventListener("change", event => applyTheme(event.target.value));
$("#password-form").addEventListener("submit", async event => {
  event.preventDefault();
  const password = $("#new-password").value;
  if (password.length < 8) return toast("Use uma senha com pelo menos 8 caracteres.");
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return toast(error.message);
  $("#password-form").reset(); toast("Senha atualizada com sucesso!");
});
$("#signout-all-button").addEventListener("click", async () => {
  if (!confirm("Deseja encerrar sua sessão em todos os dispositivos?")) return;
  const { error } = await supabase.auth.signOut({ scope: "global" });
  if (error) return toast(error.message);
  toast("Sessões encerradas.");
});
$("#delete-account-button").addEventListener("click", async () => {
  const confirmation = prompt('Para confirmar a exclusão da conta e dos dados, digite EXCLUIR:');
  if (confirmation !== "EXCLUIR") return toast("Exclusão cancelada.");
  const button = $("#delete-account-button"); button.disabled = true; button.textContent = "Excluindo...";
  try {
    const { data, error } = await supabase.functions.invoke("delete-account");
    if (error) throw error;
    if (!data?.success) throw new Error(data?.error || "A função de exclusão não confirmou a operação.");
    await supabase.auth.signOut(); toast("Conta excluída.");
  } catch (error) {
    toast(`Não foi possível excluir a conta: ${error.message}. Confira a implantação da função indicada no README.`);
  } finally { button.disabled = false; button.textContent = "Excluir minha conta e meus dados"; }
});

// Inicialização e restauração de sessão
applyTheme(localStorage.getItem("focus-theme") || "dark");
renderTimer();
if (!isSupabaseConfigured) {
  $("#auth-feedback").textContent = "Antes de começar, configure a URL e a chave publicável em js/config.js.";
} else {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) toast(error.message);
  if (session?.user) showApp(session.user);
  supabase.auth.onAuthStateChange((_event, session) => {
    queueMicrotask(() => { if (session?.user) showApp(session.user); else showAuth(); });
  });
}
