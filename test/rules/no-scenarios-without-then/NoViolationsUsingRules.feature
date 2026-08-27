Feature: Scenarios that all check something, written inside a Rule

  Rule: everything below sits inside a Rule

    Background:
      Given step6
      Then step7

    Scenario: Has its own Then
      Given step10
      When step11
      Then step12

    Scenario: Leans on the Background
      When step15

    Scenario: Verifies by way of an And
      Given step18
      When step19
      Then step20
      And step21
