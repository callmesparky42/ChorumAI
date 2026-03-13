import type { ReactNode } from 'react'
import { Dimensions, StyleSheet, Text, View } from 'react-native'
import { Area, Bar, CartesianChart } from 'victory-native'
import { LinearGradient, vec } from '@shopify/react-native-skia'
import type { TrendResult } from '@chorum/health-types'

const SCREEN_WIDTH = Dimensions.get('window').width
const CHART_WIDTH = SCREEN_WIDTH - 32
const CHART_HEIGHT = 160

interface HealthChartsProps {
  hrTrend: TrendResult | null
  sleepTrend: TrendResult | null
  stepsTrend: TrendResult | null
}

function ChartSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  )
}

function EmptyChart({ message }: { message: string }) {
  return (
    <View style={[styles.emptyChart, { width: CHART_WIDTH, height: CHART_HEIGHT }]}>
      <Text style={styles.emptyText}>{message}</Text>
    </View>
  )
}

export function HealthCharts({ hrTrend, sleepTrend, stepsTrend }: HealthChartsProps) {
  return (
    <View style={styles.container}>
      <ChartSection title="Heart Rate (14 days)">
        {!hrTrend || hrTrend.points.length === 0 ? (
          <EmptyChart message="No heart rate data. Sync Health Connect." />
        ) : (
          <CartesianChart
            data={hrTrend.points}
            xKey="date"
            yKeys={['value']}
            domainPadding={{ top: 20, bottom: 10 }}
            axisOptions={{
              font: null,
              labelColor: '#555555',
              lineColor: '#222222',
              tickCount: { x: 4, y: 4 },
            }}
          >
            {({ points, chartBounds }) => (
              <Area
                points={points['value']!}
                y0={chartBounds.bottom}
                color="#e05050"
                opacity={0.8}
              >
                <LinearGradient
                  start={vec(0, 0)}
                  end={vec(0, CHART_HEIGHT)}
                  colors={['#e05050aa', '#e0505000']}
                />
              </Area>
            )}
          </CartesianChart>
        )}
      </ChartSection>

      <ChartSection title="Sleep Duration (14 days)">
        {!sleepTrend || sleepTrend.points.length === 0 ? (
          <EmptyChart message="No sleep data. Sync Health Connect." />
        ) : (
          <CartesianChart
            data={sleepTrend.points.map((p) => ({
              ...p,
              value: Math.round((p.value / 60) * 10) / 10,
            }))}
            xKey="date"
            yKeys={['value']}
            domainPadding={{ top: 20, left: 10, right: 10 }}
            axisOptions={{
              font: null,
              labelColor: '#555555',
              lineColor: '#222222',
              tickCount: { x: 4, y: 4 },
            }}
          >
            {({ points, chartBounds }) => (
              <Bar
                points={points['value']!}
                chartBounds={chartBounds}
                color="#7050e0"
                roundedCorners={{ topLeft: 2, topRight: 2 }}
              />
            )}
          </CartesianChart>
        )}
      </ChartSection>

      <ChartSection title="Daily Steps (14 days)">
        {!stepsTrend || stepsTrend.points.length === 0 ? (
          <EmptyChart message="No steps data. Sync Health Connect." />
        ) : (
          <CartesianChart
            data={stepsTrend.points}
            xKey="date"
            yKeys={['value']}
            domainPadding={{ top: 20, left: 10, right: 10 }}
            axisOptions={{
              font: null,
              labelColor: '#555555',
              lineColor: '#222222',
              tickCount: { x: 4, y: 4 },
            }}
          >
            {({ points, chartBounds }) => (
              <Bar
                points={points['value']!}
                chartBounds={chartBounds}
                color="#50e070"
                roundedCorners={{ topLeft: 2, topRight: 2 }}
              />
            )}
          </CartesianChart>
        )}
      </ChartSection>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingBottom: 32 },
  section: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 13,
    color: '#888888',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  emptyChart: { backgroundColor: '#111111', alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: '#444444', fontSize: 13 },
})
