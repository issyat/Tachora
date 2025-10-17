# AI Assistant Test Prompts
**Comprehensive test suite for all 8 requirements**

> **Test Context:**
> - Store: Downtown Store
> - Week: 2025-W42 (October 13-19, 2025)
> - Employees: Alice Chen, Bob Smith, Charlie Davis, Diana Martinez, Eve Wilson, Frank Brown, Grace Lee, Henry Taylor, Ivy Anderson, Jack Robinson, Kate Murphy, Liam Foster, Maya Patel, Nina Scott, Oliver Hayes
> - Work Types: Cashier, Sales Floor, Inventory, Manager, Security
> - Current Date: October 17, 2025 (Friday)

---

## ✅ **REQUIREMENT 1: Natural Language Understanding**
*Understands any phrasing with typos/multilingual*

### Test 1.1: Typos and Errors
```
Prompt: "asign bob to cashier shift on munday morning"
Expected: Should understand "assign", "Monday", ignore "morning" or interpret it
Result: Creates preview for Bob → Cashier on Monday
```

### Test 1.2: Multilingual (French)
```
Prompt: "assigne Alice à la caisse lundi matin"
Expected: Understands French (assign Alice to cashier Monday morning)
Result: Creates preview for Alice → Cashier on Monday morning shift
```

### Test 1.3: Multilingual (Spanish)
```
Prompt: "¿quién trabaja el martes?"
Expected: Understands "who works Tuesday?"
Result: Lists all employees working on Tuesday
```

### Test 1.4: Casual Phrasing
```
Prompt: "can u put charlie on inventory tmrw?"
Expected: Understands "can you", "tomorrow" (context: Friday → Saturday)
Result: Creates preview for Charlie → Inventory on Saturday
```

### Test 1.5: Multiple Typos
```
Prompt: "show me all teh unasigned shfts"
Expected: Understands "the", "unassigned", "shifts"
Result: Lists all open shifts
```

---

## ✅ **REQUIREMENT 2: Truth from Single Snapshot**
*Answers from truth with single snapshot*

### Test 2.1: Query Current State
```
Prompt: "who is working on Monday?"
Expected: Shows snapshot of Monday assignments (no stale data)
Result: Lists all Monday assignments with employees and times
```

### Test 2.2: Employee Hours
```
Prompt: "how many hours is Bob working this week?"
Expected: Calculates from current snapshot
Result: "Bob is working X hours this week" with breakdown
```

### Test 2.3: Availability Check
```
Prompt: "is Alice available on Wednesday afternoon?"
Expected: Checks availability from snapshot
Result: "Yes, Alice is available 09:00-18:00" or "No, Alice is off"
```

### Test 2.4: Role Assignment Count
```
Prompt: "how many cashier shifts are filled?"
Expected: Counts from snapshot
Result: "X out of Y cashier shifts are filled"
```

### Test 2.5: Store Coverage
```
Prompt: "do we have coverage for all shifts this week?"
Expected: Analyzes snapshot for gaps
Result: "28 open shifts need assignment" or "All shifts covered"
```

---

## ✅ **REQUIREMENT 3: Context Retention**
*Keeps context like ChatGPT*

### Test 3.1: Follow-up Reference
```
Prompt 1: "show me open cashier shifts"
Expected: Lists open cashier shifts

Prompt 2: "assign Alice to the first one"
Expected: Uses context (open cashier shifts) to assign Alice to first shift
Result: Creates preview for Alice → First cashier shift from previous list
```

### Test 3.2: Multi-turn Decision
```
Prompt 1: "who can work on Saturday?"
Expected: Lists available employees

Prompt 2: "pick the one with the least hours"
Expected: Uses context (available employees) to select underworked employee
Result: Suggests employee with fewest hours
```

### Test 3.3: Short Reply (Yes/No)
```
Prompt 1: "should I assign Bob to security shift on Monday at 2pm?"
Expected: Creates preview

Prompt 2: "yes"
Expected: Uses context to apply the preview (< 150ms, no LLM call)
Result: "✓ Applied. Bob assigned to Security 14:00-19:00 on Monday"
```

### Test 3.4: Short Reply (Numeric)
```
Prompt 1: "which cashier shift should Alice work on Tuesday?"
Expected: Lists options (e.g., "1. 08:00-16:00, 2. 10:00-18:00")

Prompt 2: "2"
Expected: Uses context to select 2nd option (< 150ms)
Result: Creates preview for Alice → 2nd cashier shift
```

### Test 3.5: Name Follow-up
```
Prompt 1: "show me employees who can work cashier"
Expected: Lists cashier-qualified employees

Prompt 2: "Bob"
Expected: Uses context to select Bob from the list
Result: Shows Bob's schedule or creates assignment based on context
```

---

## ✅ **REQUIREMENT 4: Real Options Only**
*Shows only real options*

### Test 4.1: Unavailable Employee
```
Prompt: "assign Alice to Monday 9am shift"
Expected: If Alice is off Monday, should explain constraint
Result: "Alice is not available Monday (off day)" or creates preview if available
```

### Test 4.2: Role Mismatch
```
Prompt: "assign Bob to manager shift"
Expected: If Bob doesn't have Manager role, should explain
Result: "Bob is not qualified for Manager role. Bob's roles: Cashier, Security"
```

### Test 4.3: Overlapping Shifts
```
Prompt: "assign Charlie to inventory 10:00-18:00 on Monday"
Expected: If Charlie already works 09:00-17:00, should detect overlap
Result: "Conflict: Charlie already assigned 09:00-17:00 on Monday"
```

### Test 4.4: No Open Shifts
```
Prompt: "assign me to manager shift on Monday"
Expected: If no open manager shifts exist, should explain clearly
Result: "No open Manager shifts on Monday. All Manager shifts are filled. Would you like to swap or create a new shift?"
```

### Test 4.5: Weekly Hour Limit
```
Prompt: "assign Alice to Friday 08:00-20:00"
Expected: If this exceeds weekly limit, should warn
Result: "This would give Alice 45 hours (limit: 40). Reduce hours or adjust?"
```

---

## ✅ **REQUIREMENT 5: Preview → Apply Flow**
*Preview→Apply with guardrails*

### Test 5.1: Create Preview
```
Prompt: "assign Diana to sales floor Tuesday 10am to 6pm"
Expected: Creates preview (doesn't apply immediately)
Result: "Preview created: Diana → Sales Floor Tue 10:00-18:00. Say 'apply' to confirm or 'cancel' to discard."
```

### Test 5.2: Apply Preview
```
Prompt 1: "assign Bob to security Monday 2pm"
Expected: Creates preview

Prompt 2: "apply"
Expected: Applies the preview (< 150ms)
Result: "✓ Applied. Bob assigned to Security 14:00-19:00 on Monday."
```

### Test 5.3: Cancel Preview
```
Prompt 1: "assign Charlie to inventory Wednesday"
Expected: Creates preview

Prompt 2: "cancel"
Expected: Discards the preview
Result: "Preview discarded. What would you like to do?"
```

### Test 5.4: Multiple Changes Preview
```
Prompt: "assign Alice to Monday cashier and Bob to Tuesday security"
Expected: Creates preview with 2 changes
Result: Shows both assignments in preview, requires confirmation
```

### Test 5.5: Constraint Violation
```
Prompt: "assign Eve to a shift when she's off"
Expected: Preview fails constraint check
Result: "Cannot create preview: Eve is not available on that day"
```

---

## ✅ **REQUIREMENT 6: Short Reply Speed**
*Short replies instant <150ms*

### Test 6.1: Affirmative Reply
```
Prompt 1: "assign Frank to cashier Monday"
Prompt 2: "yes"
Expected: <150ms response, no LLM call, applies preview
Result: "✓ Applied" (instant)
```

### Test 6.2: Negative Reply
```
Prompt 1: "assign Grace to inventory Tuesday"
Prompt 2: "no"
Expected: <150ms response, discards preview
Result: "Preview discarded" (instant)
```

### Test 6.3: Numeric Selection
```
Prompt 1: "show me open shifts on Wednesday"
Prompt 2: "1"
Expected: <150ms response, selects first option
Result: Creates preview for first shift (instant)
```

### Test 6.4: Time Selection
```
Prompt 1: "when can Henry work on Thursday?"
Prompt 2: "morning"
Expected: <150ms response, interprets "morning" as 09:00 or morning shift
Result: Filters to morning availability/shifts (instant)
```

### Test 6.5: Multilingual Affirmative
```
Prompt 1: "assigner Ivy à la caisse vendredi"
Prompt 2: "oui"
Expected: <150ms response, French "yes", applies preview
Result: "✓ Applied" (instant)
```

---

## ✅ **REQUIREMENT 7: Tiny Clear Answers**
*Clear tiny answers ≤8 lines*

### Test 7.1: Simple Query
```
Prompt: "who works Monday?"
Expected: ≤8 lines, concise list
Result:
Monday Schedule:
• Alice - Cashier 08:00-16:00
• Bob - Security 09:00-13:00
• Charlie - Inventory 10:00-18:00
• Diana - Manager 09:00-17:00
(4 lines)
```

### Test 7.2: Availability Check
```
Prompt: "is Jack available Friday afternoon?"
Expected: ≤8 lines, direct answer
Result:
✓ Jack is available Friday 09:00-18:00
Afternoon (12:00-18:00): Available
(2 lines)
```

### Test 7.3: Hour Summary
```
Prompt: "how many hours does Kate have?"
Expected: ≤8 lines, quick summary
Result:
Kate's Hours This Week:
• Assigned: 24 hours
• Target: 32 hours
• Status: 8 hours under target
(4 lines)
```

### Test 7.4: Constraint Explanation
```
Prompt: "why can't Liam work Saturday?"
Expected: ≤8 lines, clear reason
Result:
Liam cannot work Saturday:
• Availability: OFF (not available)
(2 lines)
```

### Test 7.5: Error Message
```
Prompt: "assign Maya to a nonexistent shift"
Expected: ≤8 lines, human-readable error
Result:
Cannot assign Maya:
• No open shifts found matching request
• Try: "show open shifts" to see available options
(3 lines)
```

---

## ✅ **REQUIREMENT 8: Human-Readable Errors**
*Human-readable errors only*

### Test 8.1: Employee Not Found
```
Prompt: "assign John to cashier Monday"
Expected: Human-readable error (no employee named John)
Result: "I couldn't find an employee named 'John'. Did you mean: Jack, Diana, or someone else?"
```

### Test 8.2: Invalid Day
```
Prompt: "show me shifts for Octember 45th"
Expected: Human-readable error (invalid date)
Result: "I don't understand that date. This week is Oct 13-19, 2025. Which day did you mean?"
```

### Test 8.3: Role Not Found
```
Prompt: "assign Nina to janitor shift"
Expected: Human-readable error (no Janitor role)
Result: "We don't have a 'Janitor' work type. Available types: Cashier, Sales Floor, Inventory, Manager, Security"
```

### Test 8.4: Time Parse Error
```
Prompt: "assign Oliver to shift at 25:00"
Expected: Human-readable error (invalid time)
Result: "I don't understand '25:00'. Please use 24-hour format (e.g., 14:00 for 2pm) or 12-hour (e.g., 2pm)"
```

### Test 8.5: Ambiguous Request
```
Prompt: "assign them"
Expected: Human-readable error (unclear reference)
Result: "Who should I assign? Please specify an employee name."
```

---

## 🔍 **EDGE CASES & COMPLEX SCENARIOS**

### Edge Case 1: Cross-Store Assignment
```
Prompt: "can employees from other stores work here?"
Expected: Explains cross-store availability
Result: Lists cross-store enabled employees and their home stores
```

### Edge Case 2: Rest Time Violation
```
Prompt: "assign Alice to Tuesday 6am after Monday 11pm shift"
Expected: Detects <11 hour gap
Result: "Conflict: Alice needs 11 hours rest between shifts (currently 7 hours)"
```

### Edge Case 3: Underworked Query
```
Prompt: "who needs more hours?"
Expected: Lists employees under their target
Result: Lists employees with hours < target, sorted by shortage
```

### Edge Case 4: Swap Request
```
Prompt: "swap Alice and Bob's shifts on Monday"
Expected: Creates swap preview
Result: "Preview: Alice (Cashier) ↔ Bob (Security) on Monday. Confirm?"
```

### Edge Case 5: Bulk Assignment
```
Prompt: "assign all open cashier shifts to available employees"
Expected: Intelligently distributes shifts
Result: Creates preview with multiple assignments, balanced by hours
```

### Edge Case 6: Why Question
```
Prompt: "why is Bob assigned to security?"
Expected: Explains reasoning (role match, availability, hours)
Result: "Bob has Security role and was available 09:00-17:00. Assigned 09:00-13:00 (4h)."
```

### Edge Case 7: Template vs Assignment
```
Prompt: "show me all security shifts"
Expected: Shows both filled and open security shifts
Result: Lists actual assignments + open template-based shifts
```

### Edge Case 8: Empty Schedule
```
Prompt: "who works Sunday?"
Expected: Handles empty day gracefully
Result: "No assignments on Sunday yet. Would you like to create shifts?"
```

### Edge Case 9: Exact Time Match
```
Prompt: "assign Charlie to inventory 14:30-18:45"
Expected: Creates assignment with exact times
Result: "Preview: Charlie → Inventory Wed 14:30-18:45"
```

### Edge Case 10: Multi-Word Name
```
Prompt: "assign Aoulad to security"
Expected: Matches "Ismail Aoulad" by last name
Result: Creates preview for Ismail Aoulad → Security
```

---

## 📊 **QUICK TEST CHECKLIST**

### ✅ Core Functions (Must Pass)
- [ ] Assign employee to shift
- [ ] Show schedule for a day
- [ ] List open shifts
- [ ] Check employee hours
- [ ] Apply preview with "yes"
- [ ] Cancel preview with "no"
- [ ] Handle typos in names
- [ ] Detect unavailable employees
- [ ] Explain constraint violations

### ✅ Advanced Functions (Should Pass)
- [ ] Multi-turn conversation with context
- [ ] Numeric selection from list
- [ ] Short reply interpretation (<150ms)
- [ ] Multilingual input (French/Spanish)
- [ ] Cross-store employee handling
- [ ] Swap shift requests
- [ ] Underworked employee queries
- [ ] Why questions
- [ ] Time-of-day filtering (morning/afternoon)

### ✅ Edge Cases (Nice to Have)
- [ ] Invalid date handling
- [ ] Ambiguous name resolution
- [ ] Rest time violation detection
- [ ] Weekly hour limit warnings
- [ ] Empty schedule handling
- [ ] Bulk assignments
- [ ] Template-based shift discovery

---

## 🎯 **GOLDEN PATH TEST SEQUENCE**

**Test this sequence to verify full workflow:**

```
1. "show me open security shifts"
   → Should show Monday 14:00-19:00 Security (from template)

2. "assign me to the first one"
   → Should create preview for Ismail → Security Mon 14:00-19:00

3. "yes"
   → Should apply instantly (<150ms)
   → Result: "✓ Applied. You're assigned to Security 14:00-19:00 on Monday."

4. "how many hours do I have now?"
   → Should calculate total hours including new assignment

5. "who else works Monday?"
   → Should show all Monday assignments including the new one

6. "can I swap with Bob?"
   → Should detect Bob's Monday 09:00-13:00 Security shift
   → Creates swap preview

7. "no, cancel"
   → Should discard preview
   → "Preview discarded"

8. "show my schedule"
   → Should show Ismail's full week including Monday security
```

---

## 📝 **TESTING TIPS**

1. **Test in order**: Start with Requirement 1, progress to 8
2. **Clear context**: Type "start fresh" between test groups
3. **Verify speed**: Use browser DevTools Network tab to check <150ms for short replies
4. **Check errors**: Human-readable messages, no stack traces
5. **Multi-language**: Test French/Spanish if supported
6. **Edge cases**: Test after core functions work
7. **Golden path**: Run the full sequence at the end

---

## ✅ **SUCCESS CRITERIA**

### Minimum (Core Requirements)
- ✅ 80%+ of Requirement 1-8 tests pass
- ✅ No technical errors shown to user
- ✅ Preview→Apply flow works consistently
- ✅ Short replies <150ms (yes/no/numbers)

### Target (Production Ready)
- ✅ 95%+ of all tests pass
- ✅ All golden path steps work smoothly
- ✅ Edge cases handled gracefully
- ✅ Multilingual support working

### Stretch (Exceptional)
- ✅ 100% test pass rate
- ✅ All edge cases covered
- ✅ Context retention across 10+ turns
- ✅ Intelligent bulk operations

---

**Last Updated:** October 17, 2025  
**Version:** 1.0  
**Total Tests:** 58 prompts + 10 edge cases + 1 golden path
