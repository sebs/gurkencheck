@feat
Feature: The same mistakes, one level down

Rule: everything below sits inside a Rule

  Background:

  @dupe @dupe    @feat @every # note
  Scenario:
      Given a step
      When another thing happens
      Then something is true

  @every
  Scenario: A named one
      Given a step
