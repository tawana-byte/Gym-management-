import React, { useEffect, useState } from "react";
import { View, Text, TextInput, ScrollView, Pressable, Alert, StyleSheet, useColorScheme, Linking, StatusBar, KeyboardAvoidingView, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

const KEY = "gym-v1";
const LIGHT = { bg: "#f3f4f7", card: "#fff", text: "#101828", mute: "#667085", line: "#e1e5ec", accent: "#2b50e6", on: "#fff", ok: "#0e8a5f", okT: "#dcf5ea", warn: "#9a6700", warnT: "#fff1cc", bad: "#c62828", badT: "#fde3e1" };
const DARK = { bg: "#0d1117", card: "#161b22", text: "#e8edf3", mute: "#8b98a8", line: "#263040", accent: "#7d9bff", on: "#0b1330", ok: "#4ad6a0", okT: "#11362a", warn: "#f0c15a", warnT: "#3b2f10", bad: "#ff8a80", badT: "#431d1b" };
const DEF = { plans: [{ id: "p1", name: "Monthly", days: "30", price: "30" }, { id: "p2", name: "3 months", days: "90", price: "80" }, { id: "p3", name: "Yearly", days: "365", price: "280" }], members: [], payments: [], checkins: [] };

const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => iso(new Date());
const dt = (s) => new Date(s + "T00:00:00");
const addDays = (s, n) => { const d = dt(s); d.setDate(d.getDate() + n); return iso(d); };
const diff = (a, b) => Math.round((dt(a) - dt(b)) / 864e5);
const fd = (s) => dt(s).toDateString().slice(4);
const money = (n) => "$" + (Math.round(n * 100) / 100).toLocaleString();
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const num = (v) => parseFloat(String(v || "").replace(",", ".")) || 0;
const days = (p) => Math.max(1, parseInt(p.days) || 30);
const status = (m) => { const d = diff(m.expiry, today()); return [d < 0 ? "expired" : d <= 7 ? "soon" : "active", d]; };
const label = ([k, d]) => (k === "expired" ? `Expired ${-d} day${d === -1 ? "" : "s"} ago` : d === 0 ? "Expires today" : `${d} day${d === 1 ? "" : "s"} left`);

export default function App() {
  return <SafeAreaProvider><Gym /></SafeAreaProvider>;
}

function Gym() {
  const dark = useColorScheme() === "dark";
  const t = dark ? DARK : LIGHT;
  const [S, setS] = useState(DEF);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState("home");
  const [showForm, setShowForm] = useState(false);
  const [f, setF] = useState({ name: "", phone: "", planId: "p1", start: today(), paid: "30" });
  const [q, setQ] = useState("");
  const [cq, setCq] = useState("");
  const [filter, setFilter] = useState("all");
  const [pick, setPick] = useState({});

  useEffect(() => {
    AsyncStorage.getItem(KEY).then((v) => { if (v) setS((s) => ({ ...s, ...JSON.parse(v) })); }).catch(() => {}).finally(() => setReady(true));
  }, []);
  useEffect(() => { if (ready) AsyncStorage.setItem(KEY, JSON.stringify(S)).catch(() => {}); }, [S, ready]);

  const T = today();
  const plan = (id) => S.plans.find((p) => p.id === id) || S.plans[0] || { id: "", name: "Plan", days: "30", price: "0" };
  const ws = S.members.map((m) => ({ m, s: status(m) }));
  const exp = ws.filter((x) => x.s[0] === "expired");
  const soon = ws.filter((x) => x.s[0] === "soon");
  const rev = S.payments.filter((p) => p.date.startsWith(T.slice(0, 7))).reduce((a, p) => a + p.amt, 0);
  const todayCI = S.checkins.filter((c) => c.date === T);
  const ql = q.toLowerCase();
  const list = ws.filter(({ m, s }) => (filter === "all" || s[0] === filter) && (m.name.toLowerCase().includes(ql) || (m.phone || "").includes(q)));
  const cl = ws.filter(({ m }) => m.name.toLowerCase().includes(cq.toLowerCase()) || (m.phone || "").includes(cq)).slice(0, 15);

  const addMember = () => {
    const name = f.name.trim();
    if (!name) { Alert.alert("Enter the member’s name"); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.start) || isNaN(dt(f.start))) { Alert.alert("Start date", "Use the format YYYY-MM-DD."); return; }
    const p = plan(f.planId), paid = num(f.paid);
    const m = { id: uid(), name, phone: f.phone.trim(), planId: p.id, start: f.start, expiry: addDays(f.start, days(p)) };
    setS((s) => ({ ...s, members: [m, ...s.members], payments: paid > 0 ? [{ id: uid(), mid: m.id, name, plan: p.name, amt: paid, date: T }, ...s.payments] : s.payments }));
    setF({ name: "", phone: "", planId: p.id, start: T, paid: p.price });
    setShowForm(false);
    Alert.alert("Member added", `${name}’s membership ends ${fd(m.expiry)}.`);
  };
  const renew = (id) => {
    const m = S.members.find((x) => x.id === id);
    if (!m) return;
    const p = plan(pick[id] || m.planId), base = diff(m.expiry, T) > 0 ? m.expiry : T, e2 = addDays(base, days(p)), amt = num(p.price);
    setS((s) => ({ ...s, members: s.members.map((x) => (x.id === id ? { ...x, planId: p.id, expiry: e2 } : x)), payments: [{ id: uid(), mid: id, name: m.name, plan: p.name, amt, date: T }, ...s.payments] }));
    Alert.alert("Renewed", `${m.name} is active until ${fd(e2)}. ${money(amt)} recorded.`);
  };
  const checkIn = (id) => {
    const m = S.members.find((x) => x.id === id);
    if (!m) return;
    const s = status(m);
    if (s[0] === "expired") { Alert.alert("Membership expired", `${m.name} must renew first.`, [{ text: "Cancel", style: "cancel" }, { text: "Renew", onPress: () => renew(id) }]); return; }
    if (S.checkins.some((c) => c.mid === id && c.date === T)) { Alert.alert("Already checked in", `${m.name} checked in today.`); return; }
    setS((s2) => ({ ...s2, checkins: [{ id: uid(), mid: id, name: m.name, date: T, time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }, ...s2.checkins].slice(0, 3000) }));
    if (s[0] === "soon") Alert.alert("Checked in", `${m.name}’s membership ends in ${s[1]} day${s[1] === 1 ? "" : "s"}.`);
  };
  const delMember = (m) => Alert.alert("Delete member?", m.name, [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => setS((s) => ({ ...s, members: s.members.filter((x) => x.id !== m.id) })) }]);
  const setPlan = (id, k, v) => setS((s) => ({ ...s, plans: s.plans.map((p) => (p.id === id ? { ...p, [k]: v } : p)) }));
  const delPlan = (id) => {
    if (S.members.some((m) => m.planId === id)) { Alert.alert("Plan in use", "Some members use this plan."); return; }
    if (S.plans.length < 2) { Alert.alert("Keep at least one plan"); return; }
    setS((s) => ({ ...s, plans: s.plans.filter((p) => p.id !== id) }));
  };

  const card = [st.card, { backgroundColor: t.card, borderColor: t.line }];
  const input = [st.input, { backgroundColor: t.bg, borderColor: t.line, color: t.text }];
  const col = { active: [t.ok, t.okT], soon: [t.warn, t.warnT], expired: [t.bad, t.badT] };
  const btn = (key, text, onPress, primary) => (
    <Pressable key={key} onPress={onPress} style={[st.btn, { backgroundColor: primary ? t.accent : t.bg, borderColor: primary ? t.accent : t.line }]}>
      <Text style={{ color: primary ? t.on : t.text, fontWeight: "700", fontSize: 13 }}>{text}</Text>
    </Pressable>
  );
  const call = (m) => m.phone ? btn("c", "Call", () => Linking.openURL("tel:" + m.phone)) : null;
  const stat = (l, v, c) => (
    <View key={l} style={[st.stat, { backgroundColor: t.card, borderColor: t.line }]}><Text style={{ color: t.mute, fontSize: 12 }}>{l}</Text><Text style={{ color: c || t.text, fontSize: 24, fontWeight: "800" }}>{v}</Text></View>
  );
  const alertRows = (arr) => arr.map(({ m, s }) => (
    <View key={m.id} style={[st.row, { paddingVertical: 8, borderTopWidth: 1, borderTopColor: t.line }]}>
      <View style={{ flex: 1 }}><Text style={{ color: t.text, fontWeight: "700" }}>{m.name}</Text><Text style={{ color: t.mute, fontSize: 13 }}>{label(s)}</Text></View>
      <View style={{ flexDirection: "row", gap: 6 }}>{call(m)}{btn("r", "Renew", () => renew(m.id), true)}</View>
    </View>
  ));

  const home = () => (
    <View>
      <Text style={[st.h1, { color: t.text }]}>Gym manager</Text>
      <View style={st.grid}>
        {stat("Members", S.members.length)}
        {stat("Active", S.members.length - exp.length, t.ok)}
        {stat("Expiring in 7 days", soon.length, t.warn)}
        {stat("Expired", exp.length, t.bad)}
        {stat("Check-ins today", todayCI.length)}
        {stat("Income this month", money(rev))}
      </View>
      {S.members.length === 0 && <Text style={{ color: t.mute, marginTop: 10 }}>No members yet. Go to Members and add your first one.</Text>}
      {exp.length > 0 && <View style={card}><Text style={[st.h2, { color: t.bad }]}>🚨 Expired memberships</Text>{alertRows(exp)}</View>}
      {soon.length > 0 && <View style={card}><Text style={[st.h2, { color: t.warn }]}>⚠️ Expiring soon</Text>{alertRows(soon)}</View>}
      {S.members.length > 0 && !exp.length && !soon.length && <View style={[st.alert, { backgroundColor: t.okT }]}><Text style={{ color: t.ok, fontWeight: "700" }}>✅ All memberships are up to date.</Text></View>}
      {S.payments.length > 0 && (
        <View style={card}><Text style={[st.h2, { color: t.text }]}>Recent payments</Text>
          {S.payments.slice(0, 5).map((p) => (
            <View key={p.id} style={[st.row, { paddingVertical: 6 }]}><Text style={{ color: t.text }}>{p.name} · {p.plan}</Text><Text style={{ color: t.text, fontWeight: "700" }}>{money(p.amt)}</Text></View>
          ))}
        </View>
      )}
    </View>
  );

  const members = () => (
    <View>
      <View style={st.row}>
        <Text style={[st.h1, { color: t.text }]}>Members</Text>
        {btn("add", showForm ? "Cancel" : "+ Add member", () => setShowForm(!showForm), !showForm)}
      </View>
      {showForm && (
        <View style={card}>
          <TextInput style={input} value={f.name} onChangeText={(v) => setF({ ...f, name: v })} placeholder="Full name" placeholderTextColor={t.mute} />
          <TextInput style={[...input, { marginTop: 8 }]} value={f.phone} onChangeText={(v) => setF({ ...f, phone: v })} keyboardType="phone-pad" placeholder="Phone number" placeholderTextColor={t.mute} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 8 }}>
            {S.plans.map((p) => (
              <Pressable key={p.id} onPress={() => setF({ ...f, planId: p.id, paid: p.price })} style={[st.chip, { borderColor: t.line, backgroundColor: f.planId === p.id ? t.accent : t.bg }]}>
                <Text style={{ color: f.planId === p.id ? t.on : t.text, fontWeight: "600" }}>{p.name} ({money(num(p.price))})</Text>
              </Pressable>
            ))}
          </ScrollView>
          <TextInput style={input} value={f.start} onChangeText={(v) => setF({ ...f, start: v })} placeholder="Start date YYYY-MM-DD" placeholderTextColor={t.mute} />
          <TextInput style={[...input, { marginTop: 8 }]} value={String(f.paid)} onChangeText={(v) => setF({ ...f, paid: v })} keyboardType="decimal-pad" placeholder="Amount paid (USD)" placeholderTextColor={t.mute} />
          <Pressable onPress={addMember} style={[st.save, { backgroundColor: t.accent }]}><Text style={{ color: t.on, fontWeight: "700" }}>Save member</Text></Pressable>
        </View>
      )}
      <TextInput style={input} value={q} onChangeText={setQ} placeholder="Search name or phone" placeholderTextColor={t.mute} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 8 }}>
        {[["all", "All"], ["active", "Active"], ["soon", "Expiring"], ["expired", "Expired"]].map(([k, l]) => (
          <Pressable key={k} onPress={() => setFilter(k)} style={[st.chip, { borderColor: t.line, backgroundColor: filter === k ? t.accent : t.card }]}>
            <Text style={{ color: filter === k ? t.on : t.text, fontWeight: "600" }}>{l}</Text>
          </Pressable>
        ))}
      </ScrollView>
      {list.length === 0 && <Text style={{ color: t.mute }}>{S.members.length ? "No members match." : "No members yet. Tap + Add member."}</Text>}
      {list.map(({ m, s }) => (
        <View key={m.id} style={card}>
          <View style={st.row}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.text, fontWeight: "700", fontSize: 16 }}>{m.name}</Text>
              <Text style={{ color: t.mute, fontSize: 13 }}>{m.phone || "No phone"} · ends {fd(m.expiry)}</Text>
            </View>
            <View style={[st.badge, { backgroundColor: col[s[0]][1] }]}><Text style={{ color: col[s[0]][0], fontWeight: "700", fontSize: 12 }}>{label(s)}</Text></View>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
            {S.plans.map((p) => {
              const on = (pick[m.id] || m.planId) === p.id;
              return (
                <Pressable key={p.id} onPress={() => setPick({ ...pick, [m.id]: p.id })} style={[st.chip, { borderColor: t.line, backgroundColor: on ? t.accent : t.bg }]}>
                  <Text style={{ color: on ? t.on : t.text, fontSize: 13, fontWeight: "600" }}>{p.name}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
            {btn("r", "Renew", () => renew(m.id), true)}{btn("i", "Check in", () => checkIn(m.id))}{call(m)}{btn("d", "Delete", () => delMember(m))}
          </View>
        </View>
      ))}
    </View>
  );

  const checkin = () => (
    <View>
      <Text style={[st.h1, { color: t.text }]}>Check-in</Text>
      <TextInput style={input} value={cq} onChangeText={setCq} placeholder="Find a member" placeholderTextColor={t.mute} />
      <View style={[...card, { marginTop: 10 }]}>
        {cl.length === 0 && <Text style={{ color: t.mute }}>{S.members.length ? "No match." : "Add members first."}</Text>}
        {cl.map(({ m, s }) => (
          <View key={m.id} style={[st.row, { paddingVertical: 8 }]}>
            <View style={{ flex: 1 }}><Text style={{ color: t.text, fontWeight: "700" }}>{m.name}</Text><Text style={{ color: s[0] === "expired" ? t.bad : t.mute, fontSize: 13 }}>{label(s)}</Text></View>
            {s[0] === "expired" ? btn("r", "Renew", () => renew(m.id), true) : btn("i", "Check in", () => checkIn(m.id), true)}
          </View>
        ))}
      </View>
      <Text style={[st.h2, { color: t.text }]}>Today’s check-ins</Text>
      <View style={card}>
        {todayCI.length === 0 && <Text style={{ color: t.mute }}>Nobody yet today.</Text>}
        {todayCI.map((c) => (<View key={c.id} style={[st.row, { paddingVertical: 5 }]}><Text style={{ color: t.text, fontWeight: "600" }}>{c.name}</Text><Text style={{ color: t.mute }}>{c.time}</Text></View>))}
      </View>
    </View>
  );

  const plans = () => (
    <View>
      <Text style={[st.h1, { color: t.text }]}>Plans (USD)</Text>
      {S.plans.map((p) => (
        <View key={p.id} style={card}>
          <TextInput style={input} value={p.name} onChangeText={(v) => setPlan(p.id, "name", v)} placeholder="Plan name" placeholderTextColor={t.mute} />
          <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
            <View style={{ flex: 1 }}><Text style={{ color: t.mute, fontSize: 12 }}>Days</Text><TextInput style={input} value={String(p.days)} onChangeText={(v) => setPlan(p.id, "days", v)} keyboardType="number-pad" /></View>
            <View style={{ flex: 1 }}><Text style={{ color: t.mute, fontSize: 12 }}>Price ($)</Text><TextInput style={input} value={String(p.price)} onChangeText={(v) => setPlan(p.id, "price", v)} keyboardType="decimal-pad" /></View>
          </View>
          <View style={{ flexDirection: "row", marginTop: 8 }}>{btn("d", "Delete plan", () => delPlan(p.id))}</View>
        </View>
      ))}
      <Pressable onPress={() => setS((s) => ({ ...s, plans: [...s.plans, { id: uid(), name: "New plan", days: "30", price: "0" }] }))} style={[st.save, { backgroundColor: t.accent }]}><Text style={{ color: t.on, fontWeight: "700" }}>+ Add plan</Text></Pressable>
    </View>
  );

  const tabs = [["home", "📊", "Home"], ["members", "👥", "Members"], ["checkin", "✅", "Check-in"], ["plans", "🏷️", "Plans"]];
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
      <StatusBar barStyle={dark ? "light-content" : "dark-content"} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 30 }} keyboardShouldPersistTaps="handled">
          {tab === "home" && home()}{tab === "members" && members()}{tab === "checkin" && checkin()}{tab === "plans" && plans()}
        </ScrollView>
        <View style={[st.nav, { backgroundColor: t.card, borderTopColor: t.line }]}>
          {tabs.map(([k, ic, l]) => (
            <Pressable key={k} onPress={() => { setTab(k); setShowForm(false); }} style={{ flex: 1, alignItems: "center", paddingVertical: 8 }}>
              <Text style={{ fontSize: 20 }}>{ic}</Text><Text style={{ fontSize: 12, fontWeight: "600", color: tab === k ? t.accent : t.mute }}>{l}</Text>
            </Pressable>
          ))}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  h1: { fontSize: 26, fontWeight: "800", marginVertical: 8 },
  h2: { fontSize: 15, fontWeight: "700", marginVertical: 8 },
  card: { borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 10 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  chip: { borderWidth: 1, borderRadius: 99, paddingHorizontal: 13, paddingVertical: 7, marginRight: 6 },
  btn: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  save: { borderRadius: 10, paddingVertical: 13, alignItems: "center", marginTop: 10 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 6 },
  stat: { width: "48%", flexGrow: 1, borderWidth: 1, borderRadius: 14, padding: 12 },
  badge: { borderRadius: 99, paddingHorizontal: 9, paddingVertical: 4 },
  alert: { borderRadius: 12, padding: 12, marginVertical: 8 },
  nav: { flexDirection: "row", borderTopWidth: 1 },
});
