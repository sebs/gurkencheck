@feat
Feature: Mistakes written directly under the Feature

  Background:

  @dupe @dupe    @feat @every # note
  Scenario:
      Given a step
      When another thing happens
      Then something is true

  @every
  Scenario: A named one
      Given a step
