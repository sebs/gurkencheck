Feature: Blank lines inside a doc string

  Scenario: A step with a quoted document
    Given the message:
      """
      first paragraph


      second paragraph after two blank lines
      """
    Then it is accepted

  Scenario: A step with a backtick document
    Given the payload:
      ```


      still inside the doc string
      ```
    Then it is accepted
