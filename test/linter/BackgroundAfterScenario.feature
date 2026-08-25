@featuretag
Feature: A background written after a scenario

@scenariotag
Scenario Outline: This is a Scenario Outline
  Then this is a then step <foo>
Examples:
  | foo |
  | bar |

Background:
  Given I have a Background
