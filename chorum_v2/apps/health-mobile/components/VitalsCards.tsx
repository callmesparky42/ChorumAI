import { StyleSheet, Text, View } from 'react-native'

interface VitalsCardsProps {
  heartRate: number | null
  hrv: number | null
  sleepMinutes: number | null
  steps: number | null
}

interface MetricCardProps {
  label: string
  value: string
  unit: string
  color: string
}

function MetricCard({ label, value, unit, color }: MetricCardProps) {
  return (
    <View style={[styles.card, { borderTopColor: color }]}>
      <Text style={styles.cardLabel}>{label}</Text>
      <View style={styles.cardValueRow}>
        <Text style={styles.cardValue}>{value}</Text>
        <Text style={styles.cardUnit}>{unit}</Text>
      </View>
    </View>
  )
}

export function VitalsCards({ heartRate, hrv, sleepMinutes, steps }: VitalsCardsProps) {
  const sleepHours = sleepMinutes !== null
    ? `${Math.floor(sleepMinutes / 60)}h ${sleepMinutes % 60}m`
    : '-'

  return (
    <View style={styles.grid}>
      <MetricCard
        label="Heart Rate"
        value={heartRate !== null ? String(Math.round(heartRate)) : '-'}
        unit="bpm"
        color="#e05050"
      />
      <MetricCard
        label="HRV"
        value={hrv !== null ? String(Math.round(hrv)) : '-'}
        unit="ms"
        color="#50b0e0"
      />
      <MetricCard
        label="Sleep"
        value={sleepHours}
        unit=""
        color="#7050e0"
      />
      <MetricCard
        label="Steps"
        value={steps !== null ? steps.toLocaleString() : '-'}
        unit=""
        color="#50e070"
      />
    </View>
  )
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 12,
    gap: 12,
  },
  card: {
    width: '47%',
    backgroundColor: '#111111',
    padding: 16,
    borderTopWidth: 2,
  },
  cardLabel: { fontSize: 11, color: '#888888', letterSpacing: 1, textTransform: 'uppercase' },
  cardValueRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 8, gap: 4 },
  cardValue: { fontSize: 28, fontWeight: '700', color: '#ffffff' },
  cardUnit: { fontSize: 13, color: '#666666' },
})
