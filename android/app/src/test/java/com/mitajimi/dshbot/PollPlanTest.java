package com.mitajimi.dshbot;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

public class PollPlanTest {
    @Test
    public void statusesMapToOutcomes() {
        assertEquals(PollPlan.Outcome.OK, PollPlan.outcomeOf(200));
        assertEquals(PollPlan.Outcome.LOGIN_LOST, PollPlan.outcomeOf(401));
        assertEquals(PollPlan.Outcome.LOGIN_LOST, PollPlan.outcomeOf(403));
        assertEquals(PollPlan.Outcome.LOGIN_LOST, PollPlan.outcomeOf(303));
        assertEquals(PollPlan.Outcome.NOT_INSTALLED, PollPlan.outcomeOf(404));
        assertEquals(PollPlan.Outcome.RETRY, PollPlan.outcomeOf(502));
        assertEquals(PollPlan.Outcome.RETRY, PollPlan.outcomeOf(500));
    }

    @Test
    public void backoffGrowsThenCaps() {
        assertEquals(0, PollPlan.backoffMs(0));
        assertEquals(5_000, PollPlan.backoffMs(1));
        assertEquals(10_000, PollPlan.backoffMs(2));
        assertEquals(40_000, PollPlan.backoffMs(4));
        assertEquals(60_000, PollPlan.backoffMs(5));
        assertEquals(60_000, PollPlan.backoffMs(50));
    }

    @Test
    public void noticeTitleAndLine() {
        Notices.Notice group = new Notices.Notice("reply", "r", "投研小组", "Chief", "好的");
        assertEquals("投研小组", Notices.titleOf(group));
        assertEquals("Chief：好的", Notices.lineOf(group));
        Notices.Notice asked = new Notices.Notice("question", "s", "量化研究员", null, "用哪个数据源？");
        assertEquals("量化研究员 在问你", Notices.titleOf(asked));
        assertEquals("用哪个数据源？", Notices.lineOf(asked));
        assertEquals("DSH", Notices.titleOf(new Notices.Notice("reply", null, "", null, "x")));
    }
}
