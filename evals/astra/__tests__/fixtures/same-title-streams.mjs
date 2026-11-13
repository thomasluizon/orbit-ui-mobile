// Real staging responses of orbit-api 2f49ed78f (13 November 2026, the #2127 capture runs 2 to 5): the owner request
// "eu tenho 7 habitos chamados Water - 710ml deleta dois desses, e os outros 4 coloca Water - 1.18L" over one parent Water
// with six Water - 710ml children. Trimmed to the fields the graders read; children are in list order.
// run3: one choice card, then one applyAccountChanges preview with 4 renames and 2 deletes (the shape a correct answer gets).
// run5: one choice card, then one updateHabits preview with 4 renames and no delete (half of the request lost).
// run2 and run4: first-turn cards only; their streams do not hold the six child ids.
export const streams = {
  run3: {
    children: [
      '22371c5a-206f-44b2-b078-f67bcb7c0eb9',
      '9d154ad6-2c69-4670-80c3-907c1c3e010b',
      'ab05c969-95cb-431c-a50e-66cab06163d7',
      'd7bca0b0-37b1-4c86-ac2d-9f2ccb4e0ce5',
      'df30af5a-9025-47db-b904-1d1a79cccb36',
      'b21059e4-1cf5-4ccd-9373-f83a24142319'
    ],
    card: {
      type: 'block',
      kind: 'choice',
      block: {
        blockId: '1243971a-7d3a-4088-ba20-fd2481dddf0c',
        question: 'Quais dois hábitos Water - 710ml você quer excluir? E quais quatro renomear para Water - 1.18L?',
        options: [
          {
            id: 'setA',
            label: 'Primeiros quatro',
            description: '2 excluir, 2 renomear'
          },
          {
            id: 'setB',
            label: 'Últimos quatro',
            description: '2 excluir, 2 renomear'
          },
          {
            id: 'all6',
            label: 'Os seis',
            description: 'diga quais dois excluir'
          }
        ],
        multiSelect: false,
        allowFreeText: true
      }
    },
    answer: {
      pendingOperations: [
        {
          id: '702627b0-cf2e-4239-a758-3337ebbe9528',
          capabilityId: 'chat.changes',
          displayName: 'Account changes',
          summary: 'Review account changes',
          actionKey: 'applyAccountChanges',
          items: [
            {
              itemId: '0/ab05c969-95cb-431c-a50e-66cab06163d7',
              entityId: 'ab05c969-95cb-431c-a50e-66cab06163d7',
              entityName: 'Water - 710ml',
              removesData: false,
              fields: [
                {
                  entityId: 'ab05c969-95cb-431c-a50e-66cab06163d7',
                  entityName: 'Water - 710ml',
                  field: 'title',
                  oldValue: 'Water - 710ml',
                  newValue: 'Water - 1.18L',
                  valueType: 'text'
                }
              ]
            },
            {
              itemId: '0/d7bca0b0-37b1-4c86-ac2d-9f2ccb4e0ce5',
              entityId: 'd7bca0b0-37b1-4c86-ac2d-9f2ccb4e0ce5',
              entityName: 'Water - 710ml',
              removesData: false,
              fields: [
                {
                  entityId: 'd7bca0b0-37b1-4c86-ac2d-9f2ccb4e0ce5',
                  entityName: 'Water - 710ml',
                  field: 'title',
                  oldValue: 'Water - 710ml',
                  newValue: 'Water - 1.18L',
                  valueType: 'text'
                }
              ]
            },
            {
              itemId: '0/df30af5a-9025-47db-b904-1d1a79cccb36',
              entityId: 'df30af5a-9025-47db-b904-1d1a79cccb36',
              entityName: 'Water - 710ml',
              removesData: false,
              fields: [
                {
                  entityId: 'df30af5a-9025-47db-b904-1d1a79cccb36',
                  entityName: 'Water - 710ml',
                  field: 'title',
                  oldValue: 'Water - 710ml',
                  newValue: 'Water - 1.18L',
                  valueType: 'text'
                }
              ]
            },
            {
              itemId: '0/b21059e4-1cf5-4ccd-9373-f83a24142319',
              entityId: 'b21059e4-1cf5-4ccd-9373-f83a24142319',
              entityName: 'Water - 710ml',
              removesData: false,
              fields: [
                {
                  entityId: 'b21059e4-1cf5-4ccd-9373-f83a24142319',
                  entityName: 'Water - 710ml',
                  field: 'title',
                  oldValue: 'Water - 710ml',
                  newValue: 'Water - 1.18L',
                  valueType: 'text'
                }
              ]
            },
            {
              itemId: '1/22371c5a-206f-44b2-b078-f67bcb7c0eb9',
              entityId: '22371c5a-206f-44b2-b078-f67bcb7c0eb9',
              entityName: 'Water - 710ml',
              removesData: true,
              fields: [
                {
                  entityId: '22371c5a-206f-44b2-b078-f67bcb7c0eb9',
                  entityName: 'Water - 710ml',
                  field: 'delete',
                  oldValue: null,
                  newValue: null,
                  valueType: 'action'
                }
              ]
            },
            {
              itemId: '1/9d154ad6-2c69-4670-80c3-907c1c3e010b',
              entityId: '9d154ad6-2c69-4670-80c3-907c1c3e010b',
              entityName: 'Water - 710ml',
              removesData: true,
              fields: [
                {
                  entityId: '9d154ad6-2c69-4670-80c3-907c1c3e010b',
                  entityName: 'Water - 710ml',
                  field: 'delete',
                  oldValue: null,
                  newValue: null,
                  valueType: 'action'
                }
              ]
            }
          ]
        }
      ]
    }
  },
  run5: {
    children: [
      '9a231c17-71cc-4025-83a0-cabdda25ba05',
      'fc7960b5-cd48-4d57-a93d-1eb1b119da43',
      'c56bcf90-c694-404d-b693-1b19121c2866',
      '2e6d8361-f072-4693-9aea-2740d81bd361',
      'a6ad6c47-9174-47e0-a719-0683b8d60bb3',
      '3e06a89f-0564-4d2b-97ab-15a73c365860'
    ],
    card: {
      type: 'block',
      kind: 'choice',
      block: {
        blockId: 'ec7a44b7-09ef-4bf1-b69c-16d66e62cf43',
        question: 'Quais 2 dos 6 Water - 710ml devo excluir? Indique as posições.',
        options: [
          {
            id: 'first',
            label: 'Os dois primeiros',
            description: null
          },
          {
            id: 'last',
            label: 'Os dois últimos',
            description: null
          }
        ],
        multiSelect: false,
        allowFreeText: true
      }
    },
    answer: {
      pendingOperations: [
        {
          id: 'd4909371-0b21-49d1-a4da-1545262fd75b',
          capabilityId: 'habits.bulk.write',
          displayName: 'Bulk Habit Updates',
          summary: 'Bulk Update Habits requested via Chat',
          actionKey: 'updateHabits',
          items: [
            {
              itemId: '9a231c17-71cc-4025-83a0-cabdda25ba05',
              entityId: '9a231c17-71cc-4025-83a0-cabdda25ba05',
              entityName: 'Water - 710ml',
              removesData: false,
              fields: [
                {
                  entityId: '9a231c17-71cc-4025-83a0-cabdda25ba05',
                  entityName: 'Water - 710ml',
                  field: 'title',
                  oldValue: 'Water - 710ml',
                  newValue: 'Water - 1.18L',
                  valueType: 'text'
                }
              ]
            },
            {
              itemId: 'fc7960b5-cd48-4d57-a93d-1eb1b119da43',
              entityId: 'fc7960b5-cd48-4d57-a93d-1eb1b119da43',
              entityName: 'Water - 710ml',
              removesData: false,
              fields: [
                {
                  entityId: 'fc7960b5-cd48-4d57-a93d-1eb1b119da43',
                  entityName: 'Water - 710ml',
                  field: 'title',
                  oldValue: 'Water - 710ml',
                  newValue: 'Water - 1.18L',
                  valueType: 'text'
                }
              ]
            },
            {
              itemId: 'c56bcf90-c694-404d-b693-1b19121c2866',
              entityId: 'c56bcf90-c694-404d-b693-1b19121c2866',
              entityName: 'Water - 710ml',
              removesData: false,
              fields: [
                {
                  entityId: 'c56bcf90-c694-404d-b693-1b19121c2866',
                  entityName: 'Water - 710ml',
                  field: 'title',
                  oldValue: 'Water - 710ml',
                  newValue: 'Water - 1.18L',
                  valueType: 'text'
                }
              ]
            },
            {
              itemId: '2e6d8361-f072-4693-9aea-2740d81bd361',
              entityId: '2e6d8361-f072-4693-9aea-2740d81bd361',
              entityName: 'Water - 710ml',
              removesData: false,
              fields: [
                {
                  entityId: '2e6d8361-f072-4693-9aea-2740d81bd361',
                  entityName: 'Water - 710ml',
                  field: 'title',
                  oldValue: 'Water - 710ml',
                  newValue: 'Water - 1.18L',
                  valueType: 'text'
                }
              ]
            }
          ]
        }
      ]
    }
  },
  run2: {
    card: {
      type: 'block',
      kind: 'question',
      block: {
        blockId: '0b28a7d3-d982-44f2-ad31-8f7d7448d9c5',
        questions: [
          {
            id: 'deletar',
            type: 'singleChoice',
            prompt: 'Quais dois Water - 710ml você quer excluir?',
            options: [
              {
                id: 'cef3ec24-8a65-47ac-a51f-c520ee482101',
                label: '1º'
              },
              {
                id: 'bece8211-0080-417a-80b1-a3f9c3fbc810',
                label: '2º'
              },
              {
                id: 'afd86e20-f946-4800-8b6c-acc22fc800e9',
                label: '3º'
              },
              {
                id: '7cb14932-ab5c-46b2-bc29-faba5391e0c6',
                label: '4º'
              },
              {
                id: '3e0105a7-29b6-48bb-b4e9-59047f901bc3',
                label: '5º'
              },
              {
                id: '9b610c68-0080-417a-80b1-a3f9c3fbc810',
                label: '6º'
              }
            ],
            allowFreeText: false
          }
        ]
      }
    }
  },
  run4: {
    card: {
      type: 'block',
      kind: 'choice',
      block: {
        blockId: 'e67fd385-2110-44ba-ab88-a5ce49f7ebfb',
        question: 'Encontrei 6 hábitos Water - 710ml, não 7. Quais dois você quer excluir?',
        options: [
          {
            id: 'habit1',
            label: '1º',
            description: 'Water - 710ml'
          },
          {
            id: 'habit2',
            label: '2º',
            description: 'Water - 710ml'
          },
          {
            id: 'habit3',
            label: '3º',
            description: 'Water - 710ml'
          },
          {
            id: 'habit4',
            label: '4º',
            description: 'Water - 710ml'
          }
        ],
        multiSelect: true,
        allowFreeText: false
      }
    }
  }
}
