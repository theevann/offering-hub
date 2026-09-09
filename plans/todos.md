Make a trello like board

API LOGGER
Build a logger for LLM calls api that includes:
 llm request - llm response
secure the endpoints (groups, ingest)

DEDUPLICATION
- Change return type to include the full LLM response
- Different dedup strategy depending on category... handle the case of offerings without dates (check all offerings with same category and expiration date not yet passed)
* - USE expiry time 

OTHER:
- GIT COMMAND
- expiresAt: Set it per category ? Decide how it functions
(for now every offering as default to expire after 7 days from creation, or at endTime if exists)
We should set that by default if has to be ...

BOT 
- Allow replay log for messages failed to be sent to API


LLM CALL
* - startTimePrecision: unknown, wholeDay, fixedTime
* - Handle SALE / RENTALs with dates (start - end)
* - Handle messages sent in multiple parts (suggestion: wait 2 minutes before 
parsing a message, if two or more messages from the same user in same group within 2 minutes, parse them together)
* - Handle multi days event
* - Handle message offering recurrent events (only add them for the next week) 
* - Handle One Raw -> Many Offerings
* - Parse contact info (phone, email, etc.)
* - Add tags to the parsed offering (eg. meditation, yoga, breathwork, ecstatic dance, ...) should be a defined set of tags.
* - Add group description in the parsing context, and maybe additional info about the group (should update group model in DB: description + rules/info)
* - Parse also advices and store them !

* - Multi stage parsing:
    1. If exact duplicate or num_char < 50 && no image then no parsing - DONE
    2. Is it an offering (cheap model YES/NO + CATEGORY) ? This should be a per group setting (if group tends to have a lot of chitchat then precheck=true)
    3. Parse it: DONE
    4. Check for deduplication if (date, time, category) matches: DONE


LOCATION:
- Check if there is any google maps links in input and use it for location extraction


FRONTEND:
- location first experience ... we need to implement search by location : this would be a serverside filtering first -- need reflexion on the best UI for that
- Add bounding box pre-filtering before ST_DWithin : location && ST_Expand(user_location.geom, radiusMeters) ?

- created at time




### EXAMPLES:

This should work when sent on Monday 2026-02-23 and on Tuesday 2026-02-24
And tell the model it can be unsure about the date (especially across months) - in which case return PARSE_PARTIAL.
"""
Ahangama invites you to breathe before you scroll.

Short-form content is rewiring attention, focus, and stress levels. It’s time to take back control.

We host a paid (7000LKR) weekly live Zoom to reset your mind and retrain your attention.

Breathe to Unlock – Live on Zoom
🗓 Every Monday | 11:00–12:00 (Sri Lanka time)

•⁠  ⁠40-min guided mindfulness practice
•⁠  ⁠5-min behavioral science insight + practical tool
•⁠  ⁠15-min open sharing circle on digital habits

🔗 Sign up for the Zoom link: https://www.welligama.com/livezoom

📲 Download Welligama: https://apps.apple.com/app/welligama/id6468553389

#DigitalWellbeing #MindfulTech #AttentionMatters
"""




AND THIS
"""
Hey family! I am subletting my beautiful master bedroom in a huge colonial house 😍 

Dates: 26th of Feb - March 3rd
Price: 100 EUR for 5 nights

No AC but very cool house as it has thick walls and tall ceiling
SLT fibre internet
Huge living room and kitchen with all kitchen utensils including oven and blender!
Big garden, lovely outdoor space
"""



MULTI-EVENT

Sound Healing with Sarala

A restorative journey through sound, vibration, and stillness. Guided by the resonance of singing bowls, handpan, didgeridoo, shamanic drums, flutes, and other therapeutic instruments, this immersive experience invites deep rest, release, renewal, and a return to inner stillness.

Kurulubay, Ahangama
Fridays and Sundays at 4.30 PM 

*Pre-booking required

Reserve your spot via Instagram DM (@Kurulubay) or WhatsApp +94 76 095 0090

https://www.instagram.com/kurulubay/

https://www.instagram.com/sarala_rukshitha/



MULTI-EVENT

Hello beautiful Souls!✨Join Us at Gaia Ella Ecolodge & Yoga Center! 🌿
Nestled in the mountains of beautiful Ella, Sri Lanka, our classes take place in a peaceful outdoor shala surrounded by nature. We’d love to welcome you to practice with us in this magical setting.

✨ Daily Classes
•⁠  ⁠Morning Yoga – Sunrise Flow (Hatha & Vinyasa) 🌅
•7 AM
•2,500 LKR (props & tea included) + optional donation supporting local schools

•⁠  ⁠Women’s Yoga with Hanna💛
•4 PM (Monday, Wednesday, Friday)
•3000 LKR (props & tea included)

•⁠  ⁠Evening Yoga – Gentle Flow & Sound Healing 🌙
•6 PM 
•3,000 LKR (props & tea included)

Reserve your spot: +94 74 379 6248 (WhatsApp messages welcome!🌻)
Instagram: gaia_ella_yoga
Location: https://share.google/n5PKojrHJB0jJPWzK

Come flow with us—outdoors, surrounded by mountains, fresh air, and tranquility. 🙏💚