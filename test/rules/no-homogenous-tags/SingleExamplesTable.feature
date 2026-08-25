Feature: A scenario outline with one examples table

@tag1
Scenario: A plain scenario
  Then this is a then step

@tag2
Scenario Outline: An outline with a single examples table
  Then this is a then step <foo>
@tag5
Examples:
  | foo |
  | bar |
