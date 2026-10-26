export function fixtureNames(locale) {
  return locale === 'pt-BR' ? {
    habits: ['Beber água', 'Caminhada'], parents: ['Depois do almoço', 'Antes de dormir'], duplicate: 'Caminhada',
    tag: 'Saúde', template: 'Manhã', checklist: ['Preparar água', 'Calçar os tênis'],
    goal: 'Hidratação constante', unit: 'sessões', additional: 'Hábito adicional',
  } : {
    habits: ['Water', 'Walk'], parents: ['Post Lunch', 'Before Bed'], duplicate: 'Walk',
    tag: 'Health', template: 'Morning', checklist: ['Prepare water', 'Put on shoes'],
    goal: 'Consistent hydration', unit: 'sessions', additional: 'Additional habit',
  }
}
