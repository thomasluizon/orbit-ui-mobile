// Real staging streams of POST /api/chat/stream on orbit-api 1cf355934 (the #2129 capture runs 2 and 4): the owner
// request to delete two of the Water - 710ml habits and rename the other four, then the card answer "5º de 6" and "6º de 6".
// Each event is the recorded event; a final response lacks only its tool results (operations) and its correlation id.
// children are the six ids in list order; savedTitles are the children read back after the approval.
// complete: one question card, then one applyAccountChanges preview with 2 deletes and 4 renames.
// half: one question card, then one deleteHabits preview with 2 deletes; the denied rename is not in the preview.
export const captures = {
  "complete": {
    "children": [
      "a20fcabd-0202-4af7-8148-8097f95048fc",
      "9a11a4af-c865-4cd6-9357-71f06f33e039",
      "f5094f5b-28f0-40f0-bad3-36d1324f9a69",
      "fc9739a8-4136-41a9-b23b-10978de3a0d1",
      "08c395ba-bd3c-4660-83fa-af116d025453",
      "d72fd17f-7b42-430c-af31-762f9fbff097"
    ],
    "turns": [
      [
        {
          "type": "started",
          "turnId": "d29d5bab-c005-450d-9166-20f7c3ff0566",
          "state": "running",
          "replayed": false
        },
        {
          "type": "round",
          "iteration": 1
        },
        {
          "type": "step",
          "domain": "habits",
          "access": "read"
        },
        {
          "type": "round",
          "iteration": 2
        },
        {
          "type": "round",
          "iteration": 3
        },
        {
          "type": "final",
          "response": {
            "aiMessage": null,
            "actions": [],
            "pendingOperations": [],
            "policyDenials": [],
            "relatedSurfaces": null,
            "habitList": null,
            "goalList": null,
            "metricsCard": null,
            "periodInsight": null,
            "daySummary": null,
            "streak": null,
            "calendar": null,
            "recordLists": null,
            "accountRows": null,
            "followUps": null,
            "parts": [
              {
                "type": "block",
                "kind": "question",
                "block": {
                  "blockId": "d473987a-d287-4cc6-b0f2-cf29457e96b6",
                  "questions": [
                    {
                      "id": "records",
                      "type": "multipleChoice",
                      "prompt": "Quais dois hábitos Water - 710ml você quer excluir?",
                      "options": [
                        {
                          "id": "a20fcabd-0202-4af7-8148-8097f95048fc",
                          "label": "Water - 710ml (1º de 6)"
                        },
                        {
                          "id": "9a11a4af-c865-4cd6-9357-71f06f33e039",
                          "label": "Water - 710ml (2º de 6)"
                        },
                        {
                          "id": "f5094f5b-28f0-40f0-bad3-36d1324f9a69",
                          "label": "Water - 710ml (3º de 6)"
                        },
                        {
                          "id": "fc9739a8-4136-41a9-b23b-10978de3a0d1",
                          "label": "Water - 710ml (4º de 6)"
                        },
                        {
                          "id": "08c395ba-bd3c-4660-83fa-af116d025453",
                          "label": "Water - 710ml (5º de 6)"
                        },
                        {
                          "id": "d72fd17f-7b42-430c-af31-762f9fbff097",
                          "label": "Water - 710ml (6º de 6)"
                        }
                      ],
                      "allowFreeText": false
                    }
                  ],
                  "expiresAtUtc": "2026-11-14T15:16:06.3288086Z"
                }
              }
            ],
            "messageAllowanceConsumed": true,
            "conversationId": "68d7c034-9b82-4001-b1ea-c815d16fdbce",
            "operations": []
          },
          "turnId": "d29d5bab-c005-450d-9166-20f7c3ff0566",
          "state": "completed"
        }
      ],
      [
        {
          "type": "started",
          "turnId": "4842b02c-1195-4af5-bf93-f72c787a4379",
          "state": "running",
          "replayed": false
        },
        {
          "type": "final",
          "response": {
            "aiMessage": null,
            "actions": [],
            "pendingOperations": [
              {
                "id": "fb37e4af-bff1-433d-bd57-7e3a8b08947c",
                "capabilityId": "chat.changes",
                "displayName": "Account changes",
                "summary": "Review account changes",
                "riskClass": "Destructive",
                "confirmationRequirement": "FreshConfirmation",
                "expiresAtUtc": "2026-11-13T15:26:24.0320446Z",
                "changes": [
                  {
                    "entityId": "08c395ba-bd3c-4660-83fa-af116d025453",
                    "entityName": "Water - 710ml",
                    "field": "delete",
                    "oldValue": null,
                    "newValue": null,
                    "valueType": "action",
                    "proposedValue": null,
                    "isEditable": false
                  },
                  {
                    "entityId": "d72fd17f-7b42-430c-af31-762f9fbff097",
                    "entityName": "Water - 710ml",
                    "field": "delete",
                    "oldValue": null,
                    "newValue": null,
                    "valueType": "action",
                    "proposedValue": null,
                    "isEditable": false
                  },
                  {
                    "entityId": "a20fcabd-0202-4af7-8148-8097f95048fc",
                    "entityName": "Water - 710ml",
                    "field": "title",
                    "oldValue": "Water - 710ml",
                    "newValue": "Water - 1.18L",
                    "valueType": "text",
                    "proposedValue": "Water - 1.18L",
                    "isEditable": true,
                    "provenance": "requested"
                  },
                  {
                    "entityId": "9a11a4af-c865-4cd6-9357-71f06f33e039",
                    "entityName": "Water - 710ml",
                    "field": "title",
                    "oldValue": "Water - 710ml",
                    "newValue": "Water - 1.18L",
                    "valueType": "text",
                    "proposedValue": "Water - 1.18L",
                    "isEditable": true,
                    "provenance": "requested"
                  },
                  {
                    "entityId": "f5094f5b-28f0-40f0-bad3-36d1324f9a69",
                    "entityName": "Water - 710ml",
                    "field": "title",
                    "oldValue": "Water - 710ml",
                    "newValue": "Water - 1.18L",
                    "valueType": "text",
                    "proposedValue": "Water - 1.18L",
                    "isEditable": true,
                    "provenance": "requested"
                  },
                  {
                    "entityId": "fc9739a8-4136-41a9-b23b-10978de3a0d1",
                    "entityName": "Water - 710ml",
                    "field": "title",
                    "oldValue": "Water - 710ml",
                    "newValue": "Water - 1.18L",
                    "valueType": "text",
                    "proposedValue": "Water - 1.18L",
                    "isEditable": true,
                    "provenance": "requested"
                  }
                ],
                "changeTargetCount": 6,
                "items": [
                  {
                    "itemId": "0/08c395ba-bd3c-4660-83fa-af116d025453",
                    "entityId": "08c395ba-bd3c-4660-83fa-af116d025453",
                    "entityName": "Water - 710ml",
                    "fields": [
                      {
                        "entityId": "08c395ba-bd3c-4660-83fa-af116d025453",
                        "entityName": "Water - 710ml",
                        "field": "delete",
                        "oldValue": null,
                        "newValue": null,
                        "valueType": "action",
                        "proposedValue": null,
                        "isEditable": false
                      }
                    ],
                    "stateFingerprint": "B8F8C5983372AA7E033DA4C2BBB792CF32BE941935415B8171B1E8B9997EB1CC",
                    "removesData": true
                  },
                  {
                    "itemId": "0/d72fd17f-7b42-430c-af31-762f9fbff097",
                    "entityId": "d72fd17f-7b42-430c-af31-762f9fbff097",
                    "entityName": "Water - 710ml",
                    "fields": [
                      {
                        "entityId": "d72fd17f-7b42-430c-af31-762f9fbff097",
                        "entityName": "Water - 710ml",
                        "field": "delete",
                        "oldValue": null,
                        "newValue": null,
                        "valueType": "action",
                        "proposedValue": null,
                        "isEditable": false
                      }
                    ],
                    "stateFingerprint": "3EFA0B76AE94820C774EEBCC8A8DEB7CA69A04EAB3EEE12DDB09DECEC787A251",
                    "removesData": true
                  },
                  {
                    "itemId": "1/a20fcabd-0202-4af7-8148-8097f95048fc",
                    "entityId": "a20fcabd-0202-4af7-8148-8097f95048fc",
                    "entityName": "Water - 710ml",
                    "fields": [
                      {
                        "entityId": "a20fcabd-0202-4af7-8148-8097f95048fc",
                        "entityName": "Water - 710ml",
                        "field": "title",
                        "oldValue": "Water - 710ml",
                        "newValue": "Water - 1.18L",
                        "valueType": "text",
                        "proposedValue": "Water - 1.18L",
                        "isEditable": true,
                        "provenance": "requested"
                      }
                    ],
                    "stateFingerprint": "3C5CB3B1F6B16056759FE9B8CC867F26A104AB4E02BF8C55CDBA5CFE011AF619",
                    "removesData": false
                  },
                  {
                    "itemId": "1/9a11a4af-c865-4cd6-9357-71f06f33e039",
                    "entityId": "9a11a4af-c865-4cd6-9357-71f06f33e039",
                    "entityName": "Water - 710ml",
                    "fields": [
                      {
                        "entityId": "9a11a4af-c865-4cd6-9357-71f06f33e039",
                        "entityName": "Water - 710ml",
                        "field": "title",
                        "oldValue": "Water - 710ml",
                        "newValue": "Water - 1.18L",
                        "valueType": "text",
                        "proposedValue": "Water - 1.18L",
                        "isEditable": true,
                        "provenance": "requested"
                      }
                    ],
                    "stateFingerprint": "0F56F50303667C0CF2FAC7CF958F24E15063FB12D3F5ECC97DF4CAFEFC961AA4",
                    "removesData": false
                  },
                  {
                    "itemId": "1/f5094f5b-28f0-40f0-bad3-36d1324f9a69",
                    "entityId": "f5094f5b-28f0-40f0-bad3-36d1324f9a69",
                    "entityName": "Water - 710ml",
                    "fields": [
                      {
                        "entityId": "f5094f5b-28f0-40f0-bad3-36d1324f9a69",
                        "entityName": "Water - 710ml",
                        "field": "title",
                        "oldValue": "Water - 710ml",
                        "newValue": "Water - 1.18L",
                        "valueType": "text",
                        "proposedValue": "Water - 1.18L",
                        "isEditable": true,
                        "provenance": "requested"
                      }
                    ],
                    "stateFingerprint": "3ED8F7E9F94E0281E72612B244E4FDA9C14F23F72ABCFE1138AB69501788811F",
                    "removesData": false
                  },
                  {
                    "itemId": "1/fc9739a8-4136-41a9-b23b-10978de3a0d1",
                    "entityId": "fc9739a8-4136-41a9-b23b-10978de3a0d1",
                    "entityName": "Water - 710ml",
                    "fields": [
                      {
                        "entityId": "fc9739a8-4136-41a9-b23b-10978de3a0d1",
                        "entityName": "Water - 710ml",
                        "field": "title",
                        "oldValue": "Water - 710ml",
                        "newValue": "Water - 1.18L",
                        "valueType": "text",
                        "proposedValue": "Water - 1.18L",
                        "isEditable": true,
                        "provenance": "requested"
                      }
                    ],
                    "stateFingerprint": "808BAE6D511A81C849CA15E223050E23CDDE03C7C011997EE8F005F10A80313C",
                    "removesData": false
                  }
                ],
                "previewFingerprint": "C06FFBEBDFCEC31432933328BDD9B7E8955EA7693B2FF8C9839AA478792AC5A7",
                "actionKey": "applyAccountChanges"
              }
            ],
            "policyDenials": [],
            "relatedSurfaces": null,
            "habitList": null,
            "goalList": null,
            "metricsCard": null,
            "periodInsight": null,
            "daySummary": null,
            "streak": null,
            "calendar": null,
            "recordLists": null,
            "accountRows": null,
            "followUps": null,
            "parts": [],
            "messageAllowanceConsumed": true,
            "conversationId": "68d7c034-9b82-4001-b1ea-c815d16fdbce",
            "operations": []
          },
          "turnId": "4842b02c-1195-4af5-bf93-f72c787a4379",
          "state": "completed"
        }
      ]
    ],
    "savedTitles": [
      "Water - 1.18L",
      "Water - 1.18L",
      "Water - 1.18L",
      "Water - 1.18L"
    ]
  },
  "half": {
    "children": [
      "8538881d-7c64-4699-8d29-463cefeeebd0",
      "dab2ad98-e2bc-43e9-a400-6fed30aa59c2",
      "fc1049db-e89b-4d8c-acc5-e86d5689225c",
      "b1e9a31f-3787-4efe-a931-322001fce43e",
      "e04b33ae-e9b4-4cb5-a18a-e979184fa960",
      "abdc1134-e07c-4a8f-a31f-42354c955453"
    ],
    "turns": [
      [
        {
          "type": "started",
          "turnId": "c6f3654a-c0cb-4ca8-afa2-fe2e0a377953",
          "state": "running",
          "replayed": false
        },
        {
          "type": "round",
          "iteration": 1
        },
        {
          "type": "step",
          "domain": "habits",
          "access": "read"
        },
        {
          "type": "round",
          "iteration": 2
        },
        {
          "type": "round",
          "iteration": 3
        },
        {
          "type": "final",
          "response": {
            "aiMessage": null,
            "actions": [],
            "pendingOperations": [],
            "policyDenials": [],
            "relatedSurfaces": null,
            "habitList": null,
            "goalList": null,
            "metricsCard": null,
            "periodInsight": null,
            "daySummary": null,
            "streak": null,
            "calendar": null,
            "recordLists": null,
            "accountRows": null,
            "followUps": null,
            "parts": [
              {
                "type": "block",
                "kind": "question",
                "block": {
                  "blockId": "efb2cc9b-9d9c-409b-977c-2e42f23010a9",
                  "questions": [
                    {
                      "id": "records",
                      "type": "multipleChoice",
                      "prompt": "Há 6 Water - 710ml, não 7. Quais dois você quer excluir?",
                      "options": [
                        {
                          "id": "8538881d-7c64-4699-8d29-463cefeeebd0",
                          "label": "Water - 710ml (1º de 6)"
                        },
                        {
                          "id": "dab2ad98-e2bc-43e9-a400-6fed30aa59c2",
                          "label": "Water - 710ml (2º de 6)"
                        },
                        {
                          "id": "fc1049db-e89b-4d8c-acc5-e86d5689225c",
                          "label": "Water - 710ml (3º de 6)"
                        },
                        {
                          "id": "b1e9a31f-3787-4efe-a931-322001fce43e",
                          "label": "Water - 710ml (4º de 6)"
                        },
                        {
                          "id": "e04b33ae-e9b4-4cb5-a18a-e979184fa960",
                          "label": "Water - 710ml (5º de 6)"
                        },
                        {
                          "id": "abdc1134-e07c-4a8f-a31f-42354c955453",
                          "label": "Water - 710ml (6º de 6)"
                        }
                      ],
                      "allowFreeText": true
                    }
                  ],
                  "expiresAtUtc": "2026-11-14T15:25:34.9253374Z"
                }
              }
            ],
            "messageAllowanceConsumed": true,
            "conversationId": "dd065819-3fe0-4d89-b73d-02263d560b2b",
            "operations": []
          },
          "turnId": "c6f3654a-c0cb-4ca8-afa2-fe2e0a377953",
          "state": "completed"
        }
      ],
      [
        {
          "type": "started",
          "turnId": "dd5f59bb-fd18-4af4-8a81-a894abc177d1",
          "state": "running",
          "replayed": false
        },
        {
          "type": "final",
          "response": {
            "aiMessage": null,
            "actions": [
              {
                "type": "BulkUpdateHabits",
                "status": "Failed",
                "entityId": null,
                "entityName": null,
                "error": "Policy denied: target_not_owned:bulk_update_habits:habit",
                "field": null,
                "suggestedSubHabits": null,
                "clarificationRequest": null,
                "messageKey": "chat.toolResult.policyDenied",
                "params": {
                  "policyReason": "target_not_owned:bulk_update_habits:habit"
                }
              }
            ],
            "pendingOperations": [
              {
                "id": "de617a83-6a1e-4a58-9950-6a92b0a1b3ee",
                "capabilityId": "habits.bulk.delete",
                "displayName": "Bulk Habit Delete",
                "summary": "Bulk Delete Habits requested via Chat",
                "riskClass": "Destructive",
                "confirmationRequirement": "FreshConfirmation",
                "expiresAtUtc": "2026-11-13T15:35:45.837726Z",
                "changes": [
                  {
                    "entityId": "e04b33ae-e9b4-4cb5-a18a-e979184fa960",
                    "entityName": "Water - 710ml",
                    "field": "delete",
                    "oldValue": null,
                    "newValue": null,
                    "valueType": "action",
                    "proposedValue": null,
                    "isEditable": false
                  },
                  {
                    "entityId": "abdc1134-e07c-4a8f-a31f-42354c955453",
                    "entityName": "Water - 710ml",
                    "field": "delete",
                    "oldValue": null,
                    "newValue": null,
                    "valueType": "action",
                    "proposedValue": null,
                    "isEditable": false
                  }
                ],
                "changeTargetCount": 2,
                "items": [
                  {
                    "itemId": "e04b33ae-e9b4-4cb5-a18a-e979184fa960",
                    "entityId": "e04b33ae-e9b4-4cb5-a18a-e979184fa960",
                    "entityName": "Water - 710ml",
                    "fields": [
                      {
                        "entityId": "e04b33ae-e9b4-4cb5-a18a-e979184fa960",
                        "entityName": "Water - 710ml",
                        "field": "delete",
                        "oldValue": null,
                        "newValue": null,
                        "valueType": "action",
                        "proposedValue": null,
                        "isEditable": false
                      }
                    ],
                    "stateFingerprint": "40BC8F302766B0311CAFACBCA8A5005889479532A4312EFB8B5479FC73DBBD8C",
                    "removesData": true
                  },
                  {
                    "itemId": "abdc1134-e07c-4a8f-a31f-42354c955453",
                    "entityId": "abdc1134-e07c-4a8f-a31f-42354c955453",
                    "entityName": "Water - 710ml",
                    "fields": [
                      {
                        "entityId": "abdc1134-e07c-4a8f-a31f-42354c955453",
                        "entityName": "Water - 710ml",
                        "field": "delete",
                        "oldValue": null,
                        "newValue": null,
                        "valueType": "action",
                        "proposedValue": null,
                        "isEditable": false
                      }
                    ],
                    "stateFingerprint": "17CCD4645B9445635A30292D301194F8DB0CB65D5406C2E7146024E3B83E2629",
                    "removesData": true
                  }
                ],
                "previewFingerprint": "5A0FEB68E216D1C6445754436616E7341DC61EC9E375629F15350923821092B4",
                "actionKey": "deleteHabits"
              }
            ],
            "policyDenials": [
              {
                "operationId": "bulk_update_habits",
                "sourceName": "bulk_update_habits",
                "riskClass": "Low",
                "confirmationRequirement": "FreshConfirmation",
                "reason": "target_not_owned:bulk_update_habits:habit",
                "pendingOperationId": null
              }
            ],
            "relatedSurfaces": null,
            "habitList": null,
            "goalList": null,
            "metricsCard": null,
            "periodInsight": null,
            "daySummary": null,
            "streak": null,
            "calendar": null,
            "recordLists": null,
            "accountRows": null,
            "followUps": null,
            "parts": [],
            "messageAllowanceConsumed": true,
            "conversationId": "dd065819-3fe0-4d89-b73d-02263d560b2b",
            "operations": []
          },
          "turnId": "dd5f59bb-fd18-4af4-8a81-a894abc177d1",
          "state": "completed"
        }
      ]
    ],
    "savedTitles": [
      "Water - 710ml",
      "Water - 710ml",
      "Water - 710ml",
      "Water - 710ml"
    ]
  }
}
