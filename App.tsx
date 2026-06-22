import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Slider from '@react-native-community/slider';

// ── Ioniq 5 variants ─────────────────────────────────────────────────────────
type ChargerType = 'AC' | 'DC';

type Model = {
  id: string;
  label: string;
  year: string;
  drivetrain: string;
  usableKwh: number;
  maxAcKw: number;
  maxDcKw: number;
};

const MODELS: Model[] = [
  {
    id: 'sr_rwd',
    label: 'Standard Range RWD',
    year: '2022–2023',
    drivetrain: 'RWD',
    usableKwh: 54.0,
    maxAcKw: 7.2,
    maxDcKw: 220,
  },
  {
    id: 'lr_rwd_gen1',
    label: 'Long Range RWD',
    year: '2022–2023',
    drivetrain: 'RWD',
    usableKwh: 74.0,
    maxAcKw: 11,
    maxDcKw: 220,
  },
  {
    id: 'lr_awd_gen1',
    label: 'Long Range AWD',
    year: '2022–2023',
    drivetrain: 'AWD',
    usableKwh: 74.0,
    maxAcKw: 11,
    maxDcKw: 220,
  },
  {
    id: 'lr_rwd_gen2',
    label: 'Long Range RWD',
    year: '2024+',
    drivetrain: 'RWD',
    usableKwh: 77.4,
    maxAcKw: 11,
    maxDcKw: 350,
  },
  {
    id: 'lr_awd_gen2',
    label: 'Long Range AWD',
    year: '2024+',
    drivetrain: 'AWD',
    usableKwh: 77.4,
    maxAcKw: 11,
    maxDcKw: 350,
  },
  {
    id: 'n',
    label: 'IONIQ 5 N',
    year: '2024+',
    drivetrain: 'AWD',
    usableKwh: 84.0,
    maxAcKw: 11,
    maxDcKw: 350,
  },
];

const STORAGE_MODEL   = '@ioniq5_model_id';
const STORAGE_TYPE    = '@ioniq5_charger_type';
const STORAGE_POWER   = '@ioniq5_charger_power';

// AC grid-to-battery ~10%, DC charger-to-battery ~5%
const LOSS: Record<ChargerType, number> = { AC: 0.10, DC: 0.05 };

const C = {
  bg:        '#0D0D0F',
  card:      '#18181B',
  border:    '#2A2A2E',
  accent:    '#00C2CB',
  accentDim: '#004D52',
  accentBtn: '#00383D',
  text:      '#FFFFFF',
  textSub:   '#71717A',
  textMuted: '#3F3F46',
  danger:    '#FF6B6B',
  warning:   '#F59E0B',
} as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function calcResults(
  model: Model,
  current: number,
  target: number,
  type: ChargerType,
  chargerKw: number,
) {
  if (target <= current || chargerKw <= 0) return null;
  const loss = LOSS[type];
  const netKwh = ((target - current) / 100) * model.usableKwh;
  const fromCharger = netKwh / (1 - loss);
  const carMax = type === 'AC' ? model.maxAcKw : model.maxDcKw;
  const effectiveKw = Math.min(chargerKw, carMax);
  const timeHours = fromCharger / effectiveKw;
  const cappedBycar = chargerKw > carMax;
  return { netKwh, fromCharger, effectiveKw, timeHours, loss, cappedBycar };
}

function formatTime(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} hr`;
  return `${h} hr ${m} min`;
}

// ── Model picker ──────────────────────────────────────────────────────────────

function ModelPicker({
  visible, selected, onSelect, onClose,
}: {
  visible: boolean; selected: Model;
  onSelect: (m: Model) => void; onClose: () => void;
}) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.sheetHandle} />
        <Text style={styles.sheetTitle}>Select Your IONIQ 5</Text>
        <ScrollView showsVerticalScrollIndicator={false}>
          {MODELS.map((m) => {
            const active = m.id === selected.id;
            return (
              <TouchableOpacity
                key={m.id}
                style={styles.modelRow}
                onPress={() => { onSelect(m); onClose(); }}
                activeOpacity={0.7}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.modelRowLabel, active && { color: C.accent }]}>
                    {m.label}
                  </Text>
                  <Text style={styles.modelRowSub}>
                    {m.year} · {m.drivetrain} · {m.usableKwh} kWh · AC {m.maxAcKw} kW · DC {m.maxDcKw} kW
                  </Text>
                </View>
                {active && <View style={styles.activeDot} />}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function App() {
  const [model, setModel]               = useState<Model>(MODELS[1]);
  const [currentPct, setCurrentPct]     = useState('20');
  const [targetPct, setTargetPct]       = useState(80);
  const [chargerType, setChargerType]   = useState<ChargerType>('AC');
  const [chargerPower, setChargerPower] = useState('7.2');
  const [pickerOpen, setPickerOpen]     = useState(false);
  const resultScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(STORAGE_MODEL),
      AsyncStorage.getItem(STORAGE_TYPE),
      AsyncStorage.getItem(STORAGE_POWER),
    ]).then(([id, type, power]) => {
      if (id)    { const m = MODELS.find((x) => x.id === id); if (m) setModel(m); }
      if (type)  setChargerType(type as ChargerType);
      if (power) setChargerPower(power);
    });
  }, []);

  const handleModelSelect = (m: Model) => {
    setModel(m);
    AsyncStorage.setItem(STORAGE_MODEL, m.id);
  };

  const handleTypeChange = (t: ChargerType) => {
    setChargerType(t);
    AsyncStorage.setItem(STORAGE_TYPE, t);
  };

  const handlePowerChange = (v: string) => {
    const clean = v.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
    setChargerPower(clean);
    if (clean) AsyncStorage.setItem(STORAGE_POWER, clean);
  };

  const currentNum  = Math.min(100, Math.max(0, parseInt(currentPct) || 0));
  const targetNum   = Math.round(targetPct);
  const chargerKw   = parseFloat(chargerPower) || 0;
  const results     = calcResults(model, currentNum, targetNum, chargerType, chargerKw);
  const invalid     = targetNum <= currentNum;
  const showTaper   = chargerType === 'DC' && targetNum > 80;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(resultScale, { toValue: 1.05, duration: 100, useNativeDriver: true }),
      Animated.timing(resultScale, { toValue: 1,    duration: 150, useNativeDriver: true }),
    ]).start();
  }, [results?.fromCharger, results?.timeHours]);

  const carMaxForType = chargerType === 'AC' ? model.maxAcKw : model.maxDcKw;

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="light" />

      <View style={styles.header}>
        <Text style={styles.headerSub}>IONIQ 5</Text>
        <Text style={styles.headerTitle}>Charge Calculator</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Model */}
        <TouchableOpacity style={styles.card} onPress={() => setPickerOpen(true)} activeOpacity={0.8}>
          <Text style={styles.label}>Your Model</Text>
          <View style={styles.modelSelector}>
            <View style={{ flex: 1 }}>
              <Text style={styles.modelSelectorLabel}>{model.label}</Text>
              <Text style={styles.modelSelectorSub}>
                {model.year} · {model.drivetrain} · {model.usableKwh} kWh usable
              </Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </View>
        </TouchableOpacity>

        {/* Current battery */}
        <View style={styles.card}>
          <Text style={styles.label}>Current Battery</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.pctInput}
              value={currentPct}
              onChangeText={(v) => {
                const n = v.replace(/[^0-9]/g, '');
                if (n === '' || parseInt(n) <= 100) setCurrentPct(n);
              }}
              keyboardType="numeric"
              maxLength={3}
              selectTextOnFocus
              placeholderTextColor={C.textMuted}
              selectionColor={C.accent}
            />
            <Text style={styles.pctSymbol}>%</Text>
          </View>
          <View style={styles.miniBar}>
            <View style={[
              styles.miniBarFill,
              { width: `${currentNum}%`, backgroundColor: currentNum < 20 ? C.danger : C.accent },
            ]} />
          </View>
        </View>

        {/* Target */}
        <View style={styles.card}>
          <View style={styles.targetHeader}>
            <Text style={styles.label}>Target</Text>
            <Text style={styles.targetValue}>{targetNum}%</Text>
          </View>
          <Slider
            style={styles.slider}
            minimumValue={1}
            maximumValue={100}
            step={1}
            value={targetPct}
            onValueChange={setTargetPct}
            minimumTrackTintColor={C.accent}
            maximumTrackTintColor={C.border}
            thumbTintColor={C.accent}
          />
          <View style={styles.sliderLabels}>
            <Text style={styles.sliderLabelText}>1%</Text>
            <Text style={styles.sliderLabelText}>50%</Text>
            <Text style={styles.sliderLabelText}>100%</Text>
          </View>
        </View>

        {/* Charger */}
        <View style={styles.card}>
          <Text style={styles.label}>Charger</Text>

          {/* AC / DC toggle */}
          <View style={styles.typeToggle}>
            {(['AC', 'DC'] as ChargerType[]).map((t) => (
              <TouchableOpacity
                key={t}
                style={[styles.typeBtn, chargerType === t && styles.typeBtnActive]}
                onPress={() => handleTypeChange(t)}
                activeOpacity={0.8}
              >
                <Text style={[styles.typeBtnText, chargerType === t && styles.typeBtnTextActive]}>
                  {t === 'AC' ? '⚡ AC' : '🔋 DC'}
                </Text>
                <Text style={[styles.typeBtnSub, chargerType === t && { color: C.accent }]}>
                  {t === 'AC' ? 'Home / Public' : 'Fast Charger'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Power input */}
          <View style={styles.powerRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.powerLabel}>Charger Power</Text>
              <Text style={styles.powerHint}>
                Your car accepts up to {carMaxForType} kW {chargerType}
              </Text>
            </View>
            <View style={styles.powerInputWrap}>
              <TextInput
                style={styles.powerInput}
                value={chargerPower}
                onChangeText={handlePowerChange}
                keyboardType="decimal-pad"
                maxLength={6}
                selectTextOnFocus
                placeholderTextColor={C.textMuted}
                selectionColor={C.accent}
                placeholder="0"
              />
              <Text style={styles.powerUnit}>kW</Text>
            </View>
          </View>

          {/* DC taper warning */}
          {showTaper && (
            <View style={styles.taperWarning}>
              <Text style={styles.taperText}>
                ⚠ DC charging slows above 80% — add ~15–20 min for taper
              </Text>
            </View>
          )}

          {/* Charger capped warning */}
          {results?.cappedBycar && (
            <View style={styles.taperWarning}>
              <Text style={styles.taperText}>
                ⚠ Charger exceeds car's {chargerType} limit — capped at {carMaxForType} kW
              </Text>
            </View>
          )}
        </View>

        {/* Result */}
        <Animated.View style={[styles.resultCard, { transform: [{ scale: resultScale }] }]}>
          {invalid ? (
            <Text style={styles.resultWarning}>Target must be higher than current battery</Text>
          ) : !results ? (
            <Text style={styles.resultWarning}>Enter charger power to calculate</Text>
          ) : (
            <>
              {/* kWh */}
              <Text style={styles.resultKwh}>{results.fromCharger.toFixed(1)}</Text>
              <Text style={styles.resultUnit}>kWh from the charger</Text>

              {/* Time */}
              <View style={styles.timeRow}>
                <Text style={styles.timeIcon}>⏱</Text>
                <Text style={styles.timeValue}>{formatTime(results.timeHours)}</Text>
              </View>
              <Text style={styles.timeLabel}>estimated charge time</Text>

              <View style={styles.resultDivider} />

              <View style={styles.resultBreakdown}>
                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>Battery receives</Text>
                  <Text style={styles.breakdownValue}>{results.netKwh.toFixed(1)} kWh</Text>
                </View>
                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>Charging loss ({Math.round(results.loss * 100)}%)</Text>
                  <Text style={styles.breakdownValue}>{(results.fromCharger - results.netKwh).toFixed(1)} kWh</Text>
                </View>
                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>Effective speed</Text>
                  <Text style={styles.breakdownValue}>{results.effectiveKw} kW</Text>
                </View>
                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>Gap to fill</Text>
                  <Text style={styles.breakdownValue}>
                    {targetNum - currentNum}% of {model.usableKwh} kWh
                  </Text>
                </View>
              </View>
            </>
          )}
        </Animated.View>

        <Text style={styles.footnote}>
          Time estimate assumes constant charge rate.{'\n'}
          Actual time varies with temperature and battery state.
        </Text>
      </ScrollView>

      <ModelPicker
        visible={pickerOpen}
        selected={model}
        onSelect={handleModelSelect}
        onClose={() => setPickerOpen(false)}
      />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  header: {
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'android' ? 48 : 16,
    paddingBottom: 8,
  },
  headerSub: {
    fontSize: 11, fontWeight: '600', letterSpacing: 3,
    color: C.accent, textTransform: 'uppercase',
  },
  headerTitle: { fontSize: 26, fontWeight: '700', color: C.text, marginTop: 2 },
  scroll: { padding: 16, paddingBottom: 40, gap: 12 },
  card: {
    backgroundColor: C.card, borderRadius: 16,
    padding: 20, borderWidth: 1, borderColor: C.border,
  },
  label: {
    fontSize: 11, fontWeight: '600', letterSpacing: 1.5,
    color: C.textSub, textTransform: 'uppercase', marginBottom: 12,
  },
  // Model
  modelSelector: { flexDirection: 'row', alignItems: 'center' },
  modelSelectorLabel: { fontSize: 17, fontWeight: '600', color: C.text },
  modelSelectorSub: { fontSize: 12, color: C.textSub, marginTop: 3 },
  chevron: { fontSize: 22, color: C.textSub, marginLeft: 8 },
  // Current battery
  inputRow: { flexDirection: 'row', alignItems: 'flex-end' },
  pctInput: {
    fontSize: 52, fontWeight: '700', color: C.text,
    padding: 0, minWidth: 100, includeFontPadding: false,
  },
  pctSymbol: {
    fontSize: 28, fontWeight: '600', color: C.textSub,
    marginBottom: 8, marginLeft: 4,
  },
  miniBar: {
    height: 4, backgroundColor: C.border,
    borderRadius: 2, marginTop: 14, overflow: 'hidden',
  },
  miniBarFill: { height: 4, borderRadius: 2 },
  // Target slider
  targetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  targetValue: { fontSize: 28, fontWeight: '700', color: C.accent, marginBottom: 4 },
  slider: { width: '100%', height: 40, marginHorizontal: -4 },
  sliderLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -4 },
  sliderLabelText: { fontSize: 10, color: C.textMuted },
  // Charger type toggle
  typeToggle: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  typeBtn: {
    flex: 1, paddingVertical: 12, paddingHorizontal: 14,
    borderRadius: 12, borderWidth: 1, borderColor: C.border,
    backgroundColor: C.bg,
  },
  typeBtnActive: { backgroundColor: C.accentBtn, borderColor: C.accent },
  typeBtnText: { fontSize: 15, fontWeight: '700', color: C.textSub },
  typeBtnTextActive: { color: C.accent },
  typeBtnSub: { fontSize: 11, color: C.textMuted, marginTop: 2 },
  // Power input
  powerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  powerLabel: { fontSize: 14, fontWeight: '600', color: C.text },
  powerHint: { fontSize: 11, color: C.textSub, marginTop: 3 },
  powerInputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.bg, borderRadius: 12,
    borderWidth: 1, borderColor: C.border,
    paddingHorizontal: 14, paddingVertical: 10,
    minWidth: 90,
  },
  powerInput: {
    fontSize: 22, fontWeight: '700', color: C.text,
    padding: 0, minWidth: 44, includeFontPadding: false,
    textAlign: 'right',
  },
  powerUnit: { fontSize: 14, fontWeight: '600', color: C.textSub, marginLeft: 4 },
  // Warnings
  taperWarning: {
    marginTop: 12, backgroundColor: C.warning + '18',
    borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: C.warning + '44',
  },
  taperText: { fontSize: 12, color: C.warning, lineHeight: 18 },
  // Result
  resultCard: {
    backgroundColor: C.accentDim, borderRadius: 20, padding: 24,
    borderWidth: 1, borderColor: C.accent + '44', alignItems: 'center', marginTop: 4,
  },
  resultKwh: {
    fontSize: 64, fontWeight: '800', color: C.text,
    letterSpacing: -1, includeFontPadding: false,
  },
  resultUnit: { fontSize: 14, color: C.accent, fontWeight: '500', marginTop: 2 },
  timeRow: { flexDirection: 'row', alignItems: 'center', marginTop: 14, gap: 6 },
  timeIcon: { fontSize: 20 },
  timeValue: { fontSize: 32, fontWeight: '800', color: C.text, includeFontPadding: false },
  timeLabel: { fontSize: 12, color: C.accent + 'BB', marginTop: 2 },
  resultDivider: {
    width: '100%', height: 1,
    backgroundColor: C.accent + '33', marginVertical: 16,
  },
  resultBreakdown: { width: '100%', gap: 8 },
  breakdownRow: { flexDirection: 'row', justifyContent: 'space-between' },
  breakdownLabel: { fontSize: 13, color: C.accent + 'BB' },
  breakdownValue: { fontSize: 13, fontWeight: '600', color: C.text },
  resultWarning: { fontSize: 14, color: C.danger, textAlign: 'center', fontWeight: '500' },
  footnote: {
    fontSize: 11, color: C.textMuted,
    textAlign: 'center', lineHeight: 17, marginTop: 4,
  },
  // Modal
  overlay: { flex: 1, backgroundColor: '#000000AA' },
  sheet: {
    backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, paddingBottom: 40, maxHeight: '75%',
    borderTopWidth: 1, borderColor: C.border,
  },
  sheetHandle: {
    width: 36, height: 4, backgroundColor: C.border,
    borderRadius: 2, alignSelf: 'center', marginBottom: 16,
  },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: C.text, marginBottom: 16 },
  modelRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  modelRowLabel: { fontSize: 15, fontWeight: '600', color: C.text },
  modelRowSub: { fontSize: 11, color: C.textSub, marginTop: 3 },
  activeDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: C.accent, marginLeft: 12,
  },
});
