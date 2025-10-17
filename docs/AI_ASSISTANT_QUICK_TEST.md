# 🎯 AI Assistant Quick Test Reference

**Fast reference for testing the AI assistant - 30 essential prompts**

---

## 🚀 QUICK START (Test These First)

### 1. Basic Assignment
```
"assign me to security shift on monday"
Expected: Creates preview for Security Mon 14:00-19:00
```

### 2. Show Schedule
```
"who works on Monday?"
Expected: Lists all Monday assignments
```

### 3. Open Shifts
```
"show me open shifts"
Expected: Lists all unassigned shifts (should see ~28 open)
```

### 4. Preview → Apply
```
1. "assign Bob to cashier Monday morning"
2. "yes"
Expected: Creates preview, then applies instantly (<150ms)
```

### 5. Check Hours
```
"how many hours does Bob have?"
Expected: Shows total hours (should be ~24h including Security)
```

---

## ✅ REQUIREMENT TESTS (One per Requirement)

### REQ 1: Natural Language
```
"asign alice to cashier munday morning"
✅ Should understand typos and assign correctly
```

### REQ 2: Single Snapshot
```
"show me the current schedule"
✅ Should show up-to-date data, no stale info
```

### REQ 3: Context Retention
```
1. "show open cashier shifts"
2. "assign Alice to the first one"
✅ Should remember the list from step 1
```

### REQ 4: Real Options Only
```
"assign Bob to manager shift on Monday"
✅ Should explain if no open shifts exist or create preview
```

### REQ 5: Preview → Apply
```
"assign Diana to sales floor Tuesday 10am"
✅ Should create preview, not apply immediately
```

### REQ 6: Short Reply Speed
```
1. "assign Charlie to inventory Wednesday"
2. "yes"
✅ Step 2 should be <150ms, instant apply
```

### REQ 7: Tiny Answers
```
"who works Monday?"
✅ Response should be ≤8 lines, concise
```

### REQ 8: Human Errors
```
"assign FAKE_PERSON to cashier"
✅ Should say "couldn't find employee", not show stack trace
```

---

## 🔥 EDGE CASES (Test After Core Works)

### Typos
```
"asign bob to cashier munday"
Expected: Understands assignment despite typos
```

### Multilingual (French)
```
"qui travaille lundi?"
Expected: "Who works Monday?" - shows schedule
```

### Unavailable Employee
```
"assign Alice to a day she's off"
Expected: "Alice is not available on [day] (off day)"
```

### No Open Shifts
```
"assign me to manager shift on Tuesday"
Expected: "No open Manager shifts on Tuesday. Would you like to swap or create?"
```

### Role Mismatch
```
"assign Bob to manager"
Expected: "Bob is not qualified for Manager role. Bob's roles: Cashier, Security"
```

### Overlap Detection
```
"assign Charlie to 10:00-18:00 when he already works 09:00-17:00"
Expected: "Conflict: Charlie already assigned 09:00-17:00 on [day]"
```

### Short Replies
```
1. "show me open shifts"
2. "1" (select first)
Expected: <150ms, selects first shift
```

### Context Cancel
```
1. "assign Frank to cashier"
2. "no"
Expected: <150ms, "Preview discarded"
```

### Why Question
```
"why is Bob assigned to security?"
Expected: Explains role match, availability, hours
```

### Swap Request
```
"swap Alice and Bob's Monday shifts"
Expected: Creates swap preview with both assignments
```

---

## 🎯 GOLDEN PATH (Full Workflow)

**Test this sequence end-to-end:**

```
1. "show me open security shifts"
   ✅ Should show Monday 14:00-19:00 Security

2. "assign me to the first one"
   ✅ Creates preview: Ismail → Security Mon 14:00-19:00

3. "yes"
   ✅ Applies instantly: "✓ Applied"

4. "how many hours do I have now?"
   ✅ Shows updated total with new shift

5. "show my schedule"
   ✅ Shows full week including Monday security

6. "who else works Monday?"
   ✅ Shows Bob (09:00-13:00) and Ismail (14:00-19:00) Security

7. "can I swap with Bob?"
   ✅ Creates swap preview

8. "no"
   ✅ Discards preview instantly
```

---

## 📊 TESTING CHECKLIST

### ✅ Core Functions (Must Work)
- [ ] Assign employee to shift
- [ ] Show day schedule
- [ ] List open shifts
- [ ] Check employee hours
- [ ] Apply with "yes"
- [ ] Cancel with "no"
- [ ] Handle typos
- [ ] Detect conflicts

### ✅ Advanced (Should Work)
- [ ] Multi-turn context
- [ ] Numeric selection
- [ ] Short reply <150ms
- [ ] Multilingual
- [ ] Swap shifts
- [ ] Why questions
- [ ] Underworked queries

### ✅ Edge Cases (Nice to Have)
- [ ] Invalid dates
- [ ] Ambiguous names
- [ ] Rest time violations
- [ ] Hour limit warnings
- [ ] Empty days
- [ ] Bulk assignments

---

## 🐛 KNOWN ISSUES TO CHECK

### Security Shift Template Issue (FIXED)
```
Test: "assign me to security shift on monday"
Before: "No open Security shifts"
After: Should show 14:00-19:00 shift from template ✅
```

### Context Drift (Check)
```
Test multi-turn:
1. "show open shifts"
2. "assign Alice to first"
3. "yes"
4. "show Alice's schedule" (should show new assignment)
```

### Cross-Store Hours (Check)
```
Test: "how many hours does [cross-store employee] have?"
Expected: Should include hours from other stores
```

---

## 🧪 HOW TO TEST

### Manual Testing
1. Open chat at: `http://localhost:3000/schedule`
2. Select week 2025-W42
3. Type prompts from this guide
4. Check responses match expectations

### Automated Testing
```bash
# Start dev server first
npm run dev

# Run automated tests (in another terminal)
npx tsx scripts/test-ai-assistant.ts
```

### Performance Testing
```bash
# Check short reply speed
1. Create preview
2. Type "yes"
3. Open DevTools → Network
4. Response should be <150ms
```

---

## ✅ SUCCESS CRITERIA

### Minimum (Core)
- ✅ 8/8 requirement tests pass
- ✅ Golden path works end-to-end
- ✅ No stack traces shown to user

### Target (Production)
- ✅ All core + advanced tests pass
- ✅ 5/8 edge cases handled
- ✅ Short replies <150ms consistently

### Stretch (Exceptional)
- ✅ All tests pass
- ✅ Multilingual working
- ✅ Context retained 10+ turns

---

**Pro Tips:**
- Test in Chrome/Firefox DevTools for network timing
- Use "start fresh" to clear context between tests
- Check console for errors (should be none visible to user)
- Verify preview IDs are unique and tracked
- Test on mobile for responsive chat UI

**Quick Debug Commands:**
```bash
# Check database state
npx tsx scripts/test-ai-sees-security.ts

# Check Bob's assignments
npx tsx scripts/check-security-assignment.ts

# Verify templates exist
npx tsx scripts/analyze-security-templates.ts
```

---

**Last Updated:** October 17, 2025  
**Version:** 1.0
