import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
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

const { width } = Dimensions.get('window');

// ── Ioniq 5 variants ────────────────────────────────────────────────────────
// Gross vs usable sourced from EV Database & Hyundai spec sheets.
// Charging overhead accounts for ~10% AC grid-to-battery loss (heat, conversion).
type Model = {
  id: string;
  label: string;
  year: string;
  drivetrain: string;
  usableKwh: number;
};

const MODELS: Model[] = [
  {
    id: 'sr_rwd',
    label: 'Standard Range RWD',
    year: '2022–2023',
    drivetrain: 'RWD',
    usableKwh: 54.0,   // 58 kWh gross
  },
  {
    id: 'lr_rwd_gen1',
    label: 'Long Range RWD',
    year: '2022–2023',
    drivetrain: 'RWD',
    usableKwh: 74.0,   // 77.4 kWh gross
  },
  {
    id: 'lr_awd_gen1',
    label: 'Long Range AWD',
    year: '2022–2023',
    drivetrain: 'AWD',
    usableKwh: 74.0,   // 77.4 kWh gross
  },
  {
    id: 'lr_rwd_gen2',
    label: 'Long Range RWD',
    year: '2024+',
    drivetrain: 'RWD',
    usableKwh: 77.4,   // 84 kWh gross
  },
  {
    id: 'lr_awd_gen2',
    label: 'Long Range AWD',
    year: '2024+',
    drivetrain: 'AWD',
    usableKwh: 77.4,   // 84 kWh gross
  },
  {
    id: 'n',
    label: 'IONIQ 5 N',
    year: '2024+',
    drivetrain: 'AWD',
    usableKwh: 84.0,   // 84 kWh gross / usable
  },
];

const STORAGE_KEY = '@ioniq5_model_id';
const CHARGING_OVERHEAD = 0.10; // 10% grid-to-battery loss

const C = {
  bg: '#0D0D0F',
  card: '#18181B',
  border: '#2A2A2E',
  accent: '#00C2CB',
  accentDim: '#004D52',
  text: '#FFFFFF',
  textSub: '#71717A',
  textMuted: '#3F3F46',
  danger: '#FF6B6B',
} as const;

// ── Helpers ─────────────────────────────────────────────────────────────────

function calcKwh(model: Model, current: number, target: number): number {
  if (target <= current) return 0;
  const net = ((target - current) / 100) * model.usableKwh;
  return net / (1 - CHARGING_OVERHEAD); // include grid loss
}

// ── Model picker modal ───────────────────────────────────────────────────────

function ModelPicker({
  visible,
  selected,
  onSelect,
  onClose,
}: {
  visible: boolean;
  selected: Model;
  onSelect: (m: Model) => void;
  onClose: () => void;
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
                style={[styles.modelRow, active && styles.modelRowActive]}
                onPress={() => {
                  onSelect(m);
                  onClose();
                }}
                activeOpacity={0.7}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.modelRowLabel, active && { color: C.accent }]}>
                    {m.label}
                  </Text>
                  <Text style={styles.modelRowSub}>
                    {m.year} · {m.drivetrain} · {m.usableKwh} kWh usable
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

// ── Main screen ──────────────────────────────────────────────────────────────

export default function App() {
  const [model, setModel] = useState<Model>(MODELS[1]);
  const [currentPct, setCurrentPct] = useState<string>('20');
  const [targetPct, setTargetPct] = useState<number>(80);
  const [pickerOpen, setPickerOpen] = useState(false);
  const resultScale = useRef(new Animated.Value(1)).current;

  // Load saved model from cache
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((id) => {
      if (id) {
        const saved = MODELS.find((m) => m.id === id);
        if (saved) setModel(saved);
      }
    });
  }, []);

  const handleModelSelect = (m: Model) => {
    setModel(m);
    AsyncStorage.setItem(STORAGE_KEY, m.id);
  };

  const currentNum = Math.min(100, Math.max(0, parseInt(currentPct) || 0));
  const targetNum = Math.round(targetPct);
  const kwh = calcKwh(model, currentNum, targetNum);
  const netKwh = kwh * (1 - CHARGING_OVERHEAD); // battery actually receives this

  const invalid = targetNum <= currentNum;

  // Pulse animation on result change
  useEffect(() => {
    Animated.sequence([
      Animated.timing(resultScale, { toValue: 1.06, duration: 100, useNativeDriver: true }),
      Animated.timing(resultScale, { toValue: 1, duration: 150, useNativeDriver: true }),
    ]).start();
  }, [kwh]);

  const pctGap = targetNum - currentNum;

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerSub}>IONIQ 5</Text>
        <Text style={styles.headerTitle}>Charge Calculator</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Model selector */}
        <TouchableOpacity
          style={styles.card}
          onPress={() => setPickerOpen(true)}
          activeOpacity={0.8}
        >
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
          {/* Mini battery bar */}
          <View style={styles.miniBar}>
            <View
              style={[
                styles.miniBarFill,
                {
                  width: `${currentNum}%`,
                  backgroundColor: currentNum < 20 ? C.danger : C.accent,
                },
              ]}
            />
          </View>
        </View>

        {/* Target battery */}
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

        {/* Result card */}
        <Animated.View style={[styles.resultCard, { transform: [{ scale: resultScale }] }]}>
          {invalid ? (
            <Text style={styles.resultWarning}>
              Target must be higher than current battery
            </Text>
          ) : (
            <>
              <Text style={styles.resultKwh}>{kwh.toFixed(1)}</Text>
              <Text style={styles.resultUnit}>kWh from the charger</Text>
              <View style={styles.resultDivider} />
              <View style={styles.resultBreakdown}>
                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>Battery receives</Text>
                  <Text style={styles.breakdownValue}>{netKwh.toFixed(1)} kWh</Text>
                </View>
                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>Charging loss (~10%)</Text>
                  <Text style={styles.breakdownValue}>{(kwh - netKwh).toFixed(1)} kWh</Text>
                </View>
                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>Gap to fill</Text>
                  <Text style={styles.breakdownValue}>
                    {pctGap}% of {model.usableKwh} kWh
                  </Text>
                </View>
              </View>
            </>
          )}
        </Animated.View>

        {/* Footer note */}
        <Text style={styles.footnote}>
          Charging loss varies by charger type and temperature.{'\n'}
          10% overhead used as conservative AC estimate.
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

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'android' ? 48 : 16,
    paddingBottom: 8,
  },
  headerSub: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 3,
    color: C.accent,
    textTransform: 'uppercase',
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: C.text,
    marginTop: 2,
  },
  scroll: {
    padding: 16,
    paddingBottom: 40,
    gap: 12,
  },
  card: {
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: C.border,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.5,
    color: C.textSub,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  // Model selector
  modelSelector: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modelSelectorLabel: {
    fontSize: 17,
    fontWeight: '600',
    color: C.text,
  },
  modelSelectorSub: {
    fontSize: 12,
    color: C.textSub,
    marginTop: 3,
  },
  chevron: {
    fontSize: 22,
    color: C.textSub,
    marginLeft: 8,
  },
  // Current battery input
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  pctInput: {
    fontSize: 52,
    fontWeight: '700',
    color: C.text,
    padding: 0,
    minWidth: 100,
    includeFontPadding: false,
  },
  pctSymbol: {
    fontSize: 28,
    fontWeight: '600',
    color: C.textSub,
    marginBottom: 8,
    marginLeft: 4,
  },
  miniBar: {
    height: 4,
    backgroundColor: C.border,
    borderRadius: 2,
    marginTop: 14,
    overflow: 'hidden',
  },
  miniBarFill: {
    height: 4,
    borderRadius: 2,
  },
  // Target slider
  targetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  targetValue: {
    fontSize: 28,
    fontWeight: '700',
    color: C.accent,
    marginBottom: 4,
  },
  slider: {
    width: '100%',
    height: 40,
    marginHorizontal: -4,
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -4,
  },
  sliderLabelText: {
    fontSize: 10,
    color: C.textMuted,
  },
  // Result
  resultCard: {
    backgroundColor: C.accentDim,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: C.accent + '44',
    alignItems: 'center',
    marginTop: 4,
  },
  resultKwh: {
    fontSize: 64,
    fontWeight: '800',
    color: C.text,
    letterSpacing: -1,
    includeFontPadding: false,
  },
  resultUnit: {
    fontSize: 14,
    color: C.accent,
    fontWeight: '500',
    marginTop: 2,
  },
  resultDivider: {
    width: '100%',
    height: 1,
    backgroundColor: C.accent + '33',
    marginVertical: 16,
  },
  resultBreakdown: {
    width: '100%',
    gap: 8,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  breakdownLabel: {
    fontSize: 13,
    color: C.accent + 'BB',
  },
  breakdownValue: {
    fontSize: 13,
    fontWeight: '600',
    color: C.text,
  },
  resultWarning: {
    fontSize: 14,
    color: C.danger,
    textAlign: 'center',
    fontWeight: '500',
  },
  footnote: {
    fontSize: 11,
    color: C.textMuted,
    textAlign: 'center',
    lineHeight: 17,
    marginTop: 4,
  },
  // Modal sheet
  overlay: {
    flex: 1,
    backgroundColor: '#000000AA',
  },
  sheet: {
    backgroundColor: C.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 40,
    maxHeight: '75%',
    borderTopWidth: 1,
    borderColor: C.border,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    backgroundColor: C.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: C.text,
    marginBottom: 16,
  },
  modelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  modelRowActive: {
    //
  },
  modelRowLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: C.text,
  },
  modelRowSub: {
    fontSize: 12,
    color: C.textSub,
    marginTop: 3,
  },
  activeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.accent,
    marginLeft: 12,
  },
});
