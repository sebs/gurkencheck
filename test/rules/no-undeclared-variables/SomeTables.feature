Feature: Several Examples tables

  Scenario Outline: A variable only some tables declare
    Given <a> and <b>

    Examples: Both
      | a | b |
      | 1 | 2 |

    Examples: Only a
      | a |
      | 3 |
